"""Seed: тестовый блогер для входа по nickname/паролю.

Создаёт (или обновляет) аккаунт блогера, выдаёт ему свежий пароль,
пишет финансовую схему и пару тестовых сделок (NEW + CONFIRMED) от
любого существующего воркера, чтобы кабинет блогера не был пустым.

Запуск:

    .venv\\Scripts\\python.exe -m scripts.seed_test_blogger
    .venv\\Scripts\\python.exe -m scripts.seed_test_blogger --nickname looney_demo

После запуска в консоль выводятся nickname и пароль — этими кредами
логинимся в /blogger/login.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from core.database import dispose_db, get_session_factory, init_db
from core.settings import settings
from enums.deal import DealStatus
from enums.user import UserRole
from models.blogger_finance_scheme import BloggerFinanceScheme
from models.deal import Deal
from models.user import User
from utils.blogger_credentials import (
    build_blogger_internal_email,
    generate_blogger_password,
    normalize_blogger_nickname,
)
from utils.security import hash_password


def _normalize(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


DEFAULT_DEALS = [
    {
        "status": DealStatus.NEW,
        "shop_link": "https://example-shop.ru/products/wireless-earbuds-pro",
        "item_name": "Wireless Earbuds Pro",
        "seller_tg": "@shop_alpha_owner",
        "seller_number": "+79991110011",
        "price_rub": 7990,
        "agreed_price_rub": None,
        "created_days_ago": 1,
    },
    {
        "status": DealStatus.CONFIRMED,
        "shop_link": "https://second-shop.example/items/coffee-grinder-x2",
        "item_name": "Coffee Grinder X2",
        "seller_tg": "@second_shop_owner",
        "seller_number": "+79992220022",
        "price_rub": 12500,
        "agreed_price_rub": 12000,
        "created_days_ago": 4,
    },
]


async def _ensure_worker(db) -> User | None:
    """Берём первого активного воркера для роли «отправителя» сделок."""
    result = await db.execute(
        select(User).where(User.role == UserRole.WORKER, User.is_active == True).limit(1),  # noqa: E712
    )
    return result.scalar_one_or_none()


async def main(nickname_input: str, *, name: str, telegram: str) -> None:
    init_db(_normalize(settings.database_url))
    factory = get_session_factory()

    nickname = normalize_blogger_nickname(nickname_input)
    password = generate_blogger_password()

    async with factory() as db:
        # 1. Аккаунт блогера
        result = await db.execute(select(User).where(User.nickname == nickname))
        bloger = result.scalar_one_or_none()

        if bloger is None:
            bloger = User(
                id=uuid4(),
                name=name,
                email=build_blogger_internal_email(nickname),
                nickname=nickname,
                telegram=telegram,
                hash_pass=hash_password(password),
                role=UserRole.BLOGER,
            )
            db.add(bloger)
            await db.flush()
            action = "created"
        else:
            bloger.hash_pass = hash_password(password)
            bloger.name = name
            bloger.telegram = telegram
            action = "updated"

        # 2. Финансовая схема
        scheme_result = await db.execute(
            select(BloggerFinanceScheme).where(BloggerFinanceScheme.blogger_id == bloger.id),
        )
        scheme = scheme_result.scalar_one_or_none()
        if scheme is None:
            db.add(
                BloggerFinanceScheme(
                    id=uuid4(),
                    blogger_id=bloger.id,
                    weight_worker=40,
                    weight_bloger=40,
                    weight_upline=5,
                    weight_platform=15,
                ),
            )

        # 3. Тестовые сделки от любого воркера, если он есть
        worker = await _ensure_worker(db)
        deals_added = 0
        if worker is not None:
            existing = await db.execute(
                select(Deal.id).where(Deal.bloger_id == bloger.id).limit(1),
            )
            if existing.scalar_one_or_none() is None:
                now = datetime.now(timezone.utc)
                for spec in DEFAULT_DEALS:
                    db.add(
                        Deal(
                            id=uuid4(),
                            worker_id=worker.id,
                            bloger_id=bloger.id,
                            shop_link=str(spec["shop_link"]),
                            item_name=str(spec["item_name"]),
                            status=spec["status"],
                            created_at=now - timedelta(days=int(spec["created_days_ago"])),
                            client_contacted_at=(
                                now - timedelta(days=int(spec["created_days_ago"]) - 1)
                                if spec["status"] != DealStatus.NEW
                                else None
                            ),
                            price=int(spec["price_rub"]) * 100,
                            agreed_price_kopeks=(
                                int(spec["agreed_price_rub"]) * 100
                                if spec["agreed_price_rub"] is not None
                                else None
                            ),
                            seller_tg=str(spec["seller_tg"]),
                            seller_number=str(spec["seller_number"]),
                        ),
                    )
                    deals_added += 1

        await db.commit()
        await db.refresh(bloger)

    await dispose_db()

    print()
    print("=== Тестовый блогер готов ===")
    print(f"  status:    {action}")
    print(f"  name:      {bloger.name}")
    print(f"  nickname:  {bloger.nickname}")
    print(f"  email:     {bloger.email}")
    print(f"  telegram:  {bloger.telegram or '—'}")
    print(f"  password:  {password}")
    print(f"  deals:     {deals_added} added (от первого активного воркера)")
    print()
    print("Войдите на /blogger/login используя nickname и пароль выше.")


def cli() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--nickname",
        default="test_blogger_alpha",
        help="Никнейм блогера (только латиница/цифры/_). По умолчанию test_blogger_alpha.",
    )
    parser.add_argument(
        "--name",
        default="Alpha Test Blogger",
        help="Отображаемое имя",
    )
    parser.add_argument(
        "--telegram",
        default="@alpha_test_bg",
        help="Telegram (опционально)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.nickname, name=args.name, telegram=args.telegram))


if __name__ == "__main__":
    cli()
