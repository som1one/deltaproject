"""Seed: тестовые сделки + финансы для одного воркера.

Этот скрипт делает то же, что `scripts/seed_test_deals.py`, плюс
добавляет полноценный финансовый слой:
  - Подкручивает `платформу` (системного пользователя) с балансом.
  - Для PAID/COMPLETED сделок проводит реальные начисления
    через `_accrue_paid_deal` — у воркера появляется баланс,
    в ledger лежат записи `completed`.
  - Дополнительно в ledger воркера создаются записи разных статусов
    (`payout_request`, `freeze`, `pending_confirmation`, `rejected`),
    чтобы UI «Финансы» был не пустым и показывал все ветки фильтра.

Запуск из корня проекта:

    .venv\\Scripts\\python.exe -m scripts.seed_worker_finance --worker som1one
    .venv\\Scripts\\python.exe -m scripts.seed_worker_finance --worker @som1one
    .venv\\Scripts\\python.exe -m scripts.seed_worker_finance --worker tg_1642738616403823974@telegram.example.com

Если сделок ещё нет — скрипт сам прогонит общий seed, так что
запускать `seed_test_deals` отдельно не обязательно.

================================ ВНИМАНИЕ ================================
ЭТО СКРИПТ ДЕМО-ДАННЫХ. НЕ ЗАПУСКАТЬ В PRODUCTION.

Скрипт спроектирован идемпотентным: создание сделок пропускается, если
они уже есть (`_ensure_deals`); начисления защищены `_paid_bundle_exists`
внутри `_accrue_paid_deal`; демо-записи ledger защищены `idempotency_key`.
Поэтому повторные запуски НЕ должны накапливать долю платформы. Тем не
менее это тестовые данные — используйте только на демо/локальном стенде.
=========================================================================
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import dispose_db, get_session_factory, init_db
from core.settings import settings
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.deal import Deal
from models.ledger_entry import LedgerEntry
from models.user import User
from services.deal_service import _accrue_paid_deal, _apply_completed_stats

from scripts.seed_test_deals import (
    BLOGGERS_SEED,
    DEALS_SEED,
    _make_deal,
    find_worker,
    upsert_blogger,
)


def _normalize_async_dsn(url: str) -> str:
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


# --- Вспомогательные ------------------------------------------------------


async def _ensure_platform_user(db: AsyncSession) -> User:
    """Создаёт системного «Platform»-пользователя с фиксированным UUID,
    если его ещё нет. Без него начисления упадут с 500."""
    platform_id = settings.platform_revenue_user_id
    user = await db.get(User, platform_id)
    if user is not None:
        return user
    platform = User(
        id=platform_id,
        name="Platform Revenue",
        email="platform@looney.local",
        nickname=None,
        telegram=None,
        hash_pass="!disabled-system-account!",
        role=UserRole.ADMIN,
        balance=0,
    )
    db.add(platform)
    await db.flush()
    return platform


async def _existing_deals_for_worker(db: AsyncSession, worker_id: UUID) -> list[Deal]:
    result = await db.execute(
        select(Deal)
        .where(Deal.worker_id == worker_id)
        .order_by(Deal.created_at.desc()),
    )
    return list(result.scalars().all())


async def _ensure_deals(
    db: AsyncSession,
    worker: User,
    *,
    blogger_count: int,
) -> list[Deal]:
    """Если у воркера ещё не лежат тестовые сделки — заводим из общего seed."""
    existing = await _existing_deals_for_worker(db, worker.id)
    if len(existing) >= len(DEALS_SEED):
        print(f"Deals already exist for worker ({len(existing)}), skip creation")
        return existing

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

    created: list[Deal] = []
    for idx, deal_spec in enumerate(DEALS_SEED):
        bloger = bloggers[idx % len(bloggers)]
        deal = _make_deal(
            worker_id=worker.id,
            bloger_id=bloger.id,
            spec=deal_spec,
        )
        db.add(deal)
        created.append(deal)

    await db.flush()
    print(f"Created {len(created)} deals")
    return created + existing


async def _accrue_finance_for_deals(db: AsyncSession, deals: list[Deal]) -> None:
    """Проводит начисления и стат-апдейты для всех сделок в денежных статусах.
    Идемпотентно: внутри _accrue_paid_deal стоит check на уже существующие записи."""
    for deal in deals:
        if deal.status in (DealStatus.PAID, DealStatus.COMPLETED):
            await _accrue_paid_deal(deal, db)
        if deal.status == DealStatus.COMPLETED:
            await _apply_completed_stats(deal, db)


async def _seed_extra_ledger(db: AsyncSession, worker: User) -> int:
    """Кладёт демо-записи разных статусов в ledger воркера.
    Возвращает число добавленных строк. Идемпотентность через idempotency_key."""
    now = datetime.now(timezone.utc)
    extras: list[tuple[str, int, LedgerEntryStatus, datetime, str]] = [
        (
            f"seed:worker:{worker.id}:payout-pending",
            -3500_00,
            LedgerEntryStatus.PAYOUT_REQUEST,
            now - timedelta(hours=4),
            "Запрос на выплату 3 500 ₽",
        ),
        (
            f"seed:worker:{worker.id}:freeze",
            -1500_00,
            LedgerEntryStatus.FREEZE,
            now - timedelta(days=1, hours=2),
            "Заморозка по сделке (тестовая)",
        ),
        (
            f"seed:worker:{worker.id}:pending",
            -2200_00,
            LedgerEntryStatus.PENDING_CONFIRMATION,
            now - timedelta(days=2, hours=6),
            "Выплата ожидает подтверждения банка",
        ),
        (
            f"seed:worker:{worker.id}:rejected",
            -800_00,
            LedgerEntryStatus.REJECTED,
            now - timedelta(days=5),
            "Выплата отклонена: повторите запрос позднее",
        ),
        (
            f"seed:worker:{worker.id}:bonus",
            500_00,
            LedgerEntryStatus.COMPLETED,
            now - timedelta(days=7),
            "Бонус за активность (демо-данные)",
        ),
    ]

    added = 0
    for idem_key, amount, status, created_at, note in extras:
        result = await db.execute(
            select(LedgerEntry).where(LedgerEntry.idempotency_key == idem_key),
        )
        if result.scalar_one_or_none() is not None:
            continue

        entry = LedgerEntry(
            id=uuid4(),
            user_id=worker.id,
            deal_id=None,
            amount_kopeks=amount,
            status=status,
            idempotency_key=idem_key,
            note=note,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(entry)
        added += 1

    if added:
        # Положительный бонус увеличивает баланс воркера, чтобы UI показывал
        # ненулевые «Доступно к выводу».
        worker.balance += 500_00

    return added


# --- Основной поток -------------------------------------------------------


async def seed(worker_identifier: str, *, blogger_count: int) -> None:
    init_db(_normalize_async_dsn(settings.database_url))
    factory = get_session_factory()

    async with factory() as db:
        worker = await find_worker(db, worker_identifier)
        print(f"Worker: {worker.name} ({worker.email}) — {worker.id}")

        await _ensure_platform_user(db)

        deals = await _ensure_deals(db, worker, blogger_count=blogger_count)
        await _accrue_finance_for_deals(db, deals)
        added = await _seed_extra_ledger(db, worker)

        await db.commit()
        await db.refresh(worker)

        print()
        print(f"Worker balance:     {worker.balance / 100:.2f} ₽")
        print(f"Extra ledger rows:  {added}")

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
