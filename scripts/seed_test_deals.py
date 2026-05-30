"""Seed: 1-2 тестовых блогера + 5 сделок для конкретного воркера.

Запуск из корня проекта:

    python -m scripts.seed_test_deals --worker som1one
    # или по email:
    python -m scripts.seed_test_deals --worker tg_1642738616403823974@telegram.example.com

Воркер ищется по nickname / email / telegram-handle (`@som1one`).
Если блогера с указанным ником нет, он создаётся вместе с финансовой
схемой. Сделки пишутся напрямую в БД, без admin-эндпоинтов: статусы
проставлены руками, чтобы покрыть все ветки UI.

================================ ВНИМАНИЕ ================================
ЭТО НЕИДЕМПОТЕНТНЫЙ СКРИПТ ДЕМО-ДАННЫХ. НЕ ЗАПУСКАТЬ В PRODUCTION.

Скрипт идемпотентен ТОЛЬКО в части блогеров (перевызов не дублирует
блогеров), но КАЖДЫЙ запуск создаёт новые 5 сделок. Если сделки доходят
до статусов PAID/COMPLETED и по ним проводятся начисления (см.
`scripts/seed_worker_finance.py`), повторные запуски НАКАПЛИВАЮТ долю
платформы на её системном балансе (N запусков → N×доля). Именно это —
источник искажения «сырого» баланса платформы из расследования Req 6,
а НЕ ошибка в `distribute_price_kopeks`/`_accrue_paid_deal`.

Для демо-стенда это приемлемо; для воспроизводимых данных удаляйте
прежние сделки/начисления перед повторным запуском.
=========================================================================
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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


def _normalize_async_dsn(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


# --- Конфиг тест-данных ---------------------------------------------------

BLOGGERS_SEED: list[dict[str, object]] = [
    {
        "nickname": "test_blogger_alpha",
        "name": "Alpha Test Blogger",
        "telegram": "@alpha_test_bg",
        "weights": (40, 40, 5, 15),  # worker, bloger, upline, platform
    },
    {
        "nickname": "test_blogger_beta",
        "name": "Beta Test Blogger",
        "telegram": "@beta_test_bg",
        "weights": (35, 45, 5, 15),
    },
]


# Каждая сделка задаёт статус, опциональную agreed_price (для PAID/COMPLETED)
# и сдвиг created_at от now() в днях.
DEALS_SEED: list[dict[str, object]] = [
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
        "status": DealStatus.REVIEW,
        "shop_link": "https://second-shop.example/items/coffee-grinder-x2",
        "item_name": "Coffee Grinder X2",
        "seller_tg": "@second_shop_owner",
        "seller_number": "+79992220022",
        "price_rub": 12500,
        "agreed_price_rub": None,
        "created_days_ago": 4,
    },
    {
        "status": DealStatus.CONFIRMED,
        "shop_link": "https://third-shop.example/sku/yoga-mat-premium",
        "item_name": "Yoga Mat Premium",
        "seller_tg": "@third_shop_owner",
        "seller_number": "+79993330033",
        "price_rub": 4500,
        "agreed_price_rub": 4200,
        "created_days_ago": 8,
    },
    {
        "status": DealStatus.PAID,
        "shop_link": "https://fourth-shop.example/products/desk-lamp-led",
        "item_name": "Desk Lamp LED",
        "seller_tg": "@fourth_shop_owner",
        "seller_number": "+79994440044",
        "price_rub": 6300,
        "agreed_price_rub": 6300,
        "created_days_ago": 14,
    },
    {
        "status": DealStatus.REJECTED,
        "shop_link": "https://fifth-shop.example/items/sketchy-phone-case",
        "item_name": "Sketchy Phone Case",
        "seller_tg": "@fifth_shop_owner",
        "seller_number": "+79995550055",
        "price_rub": 1500,
        "agreed_price_rub": None,
        "created_days_ago": 20,
    },
]


# --- Поиск воркера --------------------------------------------------------


async def find_worker(db: AsyncSession, identifier: str) -> User:
    """Ищет воркера по nickname, email или telegram-handle.

    Принимает значения с/без `@`, регистр игнорируется. Для Telegram-воркера
    подходит и синтетический email вида `tg_<id>@telegram.example.com`.
    """
    needle = identifier.strip()
    if not needle:
        raise SystemExit("--worker не должен быть пустым")

    # 1) email — ровное совпадение
    if "@" in needle and "." in needle:
        result = await db.execute(select(User).where(User.email == needle))
        user = result.scalar_one_or_none()
        if user is not None:
            return _ensure_worker(user)

    # 2) telegram handle — с `@` или без
    handle_candidates = {
        needle if needle.startswith("@") else f"@{needle.lstrip('@')}",
    }
    result = await db.execute(
        select(User).where(User.telegram.in_(list(handle_candidates))),
    )
    user = result.scalars().first()
    if user is not None:
        return _ensure_worker(user)

    # 3) nickname (нормализованный регистр)
    try:
        nickname = normalize_blogger_nickname(needle)
    except ValueError:
        nickname = None
    if nickname is not None:
        result = await db.execute(select(User).where(User.nickname == nickname))
        user = result.scalar_one_or_none()
        if user is not None:
            return _ensure_worker(user)

    # 4) name (case-insensitive contains, последний шанс)
    result = await db.execute(
        select(User).where(User.name.ilike(needle)).limit(2),
    )
    matches = result.scalars().all()
    if len(matches) == 1:
        return _ensure_worker(matches[0])

    raise SystemExit(
        f"Не удалось найти воркера по '{identifier}'. "
        f"Передай email, @telegram, nickname или точное имя."
    )


def _ensure_worker(user: User) -> User:
    if user.role != UserRole.WORKER:
        raise SystemExit(
            f"Пользователь {user.email} имеет роль {user.role.value}, "
            f"а не Worker — сделки на него заводить нельзя."
        )
    return user


# --- Создание блогеров ---------------------------------------------------


async def upsert_blogger(
    db: AsyncSession,
    *,
    nickname: str,
    name: str,
    telegram: str,
    weights: tuple[int, int, int, int],
) -> User:
    nickname = normalize_blogger_nickname(nickname)
    result = await db.execute(select(User).where(User.nickname == nickname))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    bloger = User(
        id=uuid4(),
        name=name,
        email=build_blogger_internal_email(nickname),
        nickname=nickname,
        telegram=telegram,
        hash_pass=hash_password(generate_blogger_password()),
        role=UserRole.BLOGER,
    )
    db.add(bloger)
    await db.flush()  # хотим bloger.id для finance scheme

    scheme = BloggerFinanceScheme(
        id=uuid4(),
        blogger_id=bloger.id,
        weight_worker=weights[0],
        weight_bloger=weights[1],
        weight_upline=weights[2],
        weight_platform=weights[3],
    )
    db.add(scheme)
    return bloger


# --- Сделки --------------------------------------------------------------


def _rub_to_kopeks(rub: int | None) -> int | None:
    return None if rub is None else int(rub) * 100


def _make_deal(
    *,
    worker_id: UUID,
    bloger_id: UUID,
    spec: dict[str, object],
) -> Deal:
    now = datetime.now(timezone.utc)
    created_at = now - timedelta(days=int(spec["created_days_ago"]))
    status = spec["status"]
    if not isinstance(status, DealStatus):  # safety
        raise TypeError(f"Bad DealStatus: {status!r}")

    price_kopeks = _rub_to_kopeks(int(spec["price_rub"]))
    agreed_kopeks = _rub_to_kopeks(spec.get("agreed_price_rub"))  # type: ignore[arg-type]

    # client_contacted_at имеет смысл с REVIEW и далее.
    contacted_at: datetime | None = None
    if status not in (DealStatus.NEW, DealStatus.REJECTED):
        contacted_at = created_at + timedelta(hours=random.randint(1, 36))

    return Deal(
        id=uuid4(),
        worker_id=worker_id,
        bloger_id=bloger_id,
        shop_link=str(spec["shop_link"]),
        item_name=str(spec["item_name"]),
        status=status,
        created_at=created_at,
        client_contacted_at=contacted_at,
        agreed_price_kopeks=agreed_kopeks,
        price=int(price_kopeks or 0),
        seller_tg=str(spec["seller_tg"]),
        seller_number=str(spec["seller_number"]),
    )


# --- Главный поток -------------------------------------------------------


async def seed(worker_identifier: str, *, blogger_count: int) -> None:
    init_db(_normalize_async_dsn(settings.database_url))
    factory = get_session_factory()

    async with factory() as db:
        worker = await find_worker(db, worker_identifier)
        print(f"Worker: {worker.name} ({worker.email}) — {worker.id}")

        bloggers: list[User] = []
        for spec in BLOGGERS_SEED[:blogger_count]:
            bloger = await upsert_blogger(
                db,
                nickname=str(spec["nickname"]),
                name=str(spec["name"]),
                telegram=str(spec["telegram"]),
                weights=spec["weights"],  # type: ignore[arg-type]
            )
            bloggers.append(bloger)
            print(f"Blogger: @{bloger.nickname} — {bloger.id}")

        if not bloggers:
            raise SystemExit("Не создан ни один блогер — нечем заполнять сделки")

        created_deals: list[Deal] = []
        for idx, deal_spec in enumerate(DEALS_SEED):
            bloger = bloggers[idx % len(bloggers)]
            deal = _make_deal(
                worker_id=worker.id,
                bloger_id=bloger.id,
                spec=deal_spec,
            )
            db.add(deal)
            created_deals.append(deal)

        await db.commit()
        print(f"\nCreated {len(created_deals)} deals:")
        for deal in created_deals:
            await db.refresh(deal)
            print(
                f"  {deal.status.value:<10} "
                f"{deal.item_name:<28} "
                f"price={deal.price/100:.2f}₽ "
                f"agreed={(deal.agreed_price_kopeks or 0)/100:.2f}₽ "
                f"id={deal.id}"
            )

    await dispose_db()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--worker",
        required=True,
        help="email / @telegram / nickname / точное имя воркера",
    )
    parser.add_argument(
        "--bloggers",
        type=int,
        default=2,
        choices=(1, 2),
        help="Сколько блогеров использовать (1 или 2). По умолчанию 2.",
    )
    args = parser.parse_args(argv)
    asyncio.run(seed(args.worker, blogger_count=args.bloggers))


if __name__ == "__main__":
    main()
