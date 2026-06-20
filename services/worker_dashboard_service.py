"""Сервис кабинета воркера на маркетплейсе.

Предоставляет данные для дашборда воркера:
- Список приведённых заказчиков (рефералов)
- История начислений комиссий
- Сводная статистика (баланс, общий заработок, кол-во рефералов)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_order import MarketplaceOrder
from models.user import User
from models.user_session import UserSession
from schemas.worker_dashboard import (
    CommissionEntry,
    ReferralInfo,
    WorkerMarketplaceStats,
)


async def get_referrals(
    db: AsyncSession,
    worker_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[ReferralInfo], int]:
    """Список приведённых заказчиков (рефералов воркера).

    Возвращает пользователей с marketplace_referred_by == worker_id,
    отсортированных по дате регистрации (новые сначала), с пагинацией.
    Дата регистрации берётся из user_sessions (session_kind='register').

    Args:
        db: Асинхронная сессия БД.
        worker_id: ID воркера.
        page: Номер страницы (начиная с 1).
        page_size: Количество записей на страницу.

    Returns:
        Кортеж (список рефералов, общее количество).
    """
    base_filter = User.marketplace_referred_by == worker_id

    # Подсчёт общего количества
    count_stmt = select(func.count(User.id)).where(base_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Подзапрос для даты регистрации из user_sessions
    reg_session = (
        select(
            UserSession.user_id,
            func.min(UserSession.created_at).label("registered_at"),
        )
        .where(UserSession.session_kind == "register")
        .group_by(UserSession.user_id)
        .subquery()
    )

    # Основной запрос с LEFT JOIN на сессии регистрации
    offset = (page - 1) * page_size
    query = (
        select(
            User.id,
            User.name,
            reg_session.c.registered_at,
        )
        .outerjoin(reg_session, User.id == reg_session.c.user_id)
        .where(base_filter)
        .order_by(reg_session.c.registered_at.desc().nullslast())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(query)).all()

    items = [
        ReferralInfo(
            client_id=row.id,
            client_name=row.name,
            registered_at=row.registered_at or datetime.min.replace(tzinfo=None),
        )
        for row in rows
    ]

    return items, total


async def get_commission_history(
    db: AsyncSession,
    worker_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[CommissionEntry], int]:
    """История начислений комиссий воркеру.

    Возвращает записи из escrow ledger с entry_type='release_worker'
    для данного воркера, обогащённые данными из заказа и заказчика.
    Сортировка: новые сначала. Пагинация offset-based.

    Args:
        db: Асинхронная сессия БД.
        worker_id: ID воркера.
        page: Номер страницы (начиная с 1).
        page_size: Количество записей на страницу.

    Returns:
        Кортеж (список записей комиссий, общее количество).
    """
    base_filter = [
        MarketplaceEscrowEntry.user_id == worker_id,
        MarketplaceEscrowEntry.entry_type == "release_worker",
    ]

    # Подсчёт общего количества
    count_stmt = select(func.count(MarketplaceEscrowEntry.id)).where(*base_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Основной запрос с JOIN на заказ и заказчика
    offset = (page - 1) * page_size
    client_alias = User.__table__.alias("client")

    query = (
        select(
            MarketplaceEscrowEntry.order_id,
            MarketplaceEscrowEntry.amount_kopeks,
            MarketplaceEscrowEntry.created_at,
            MarketplaceOrder.amount_kopeks.label("order_amount_kopeks"),
            MarketplaceOrder.worker_commission_pct,
            client_alias.c.name.label("client_name"),
        )
        .join(
            MarketplaceOrder,
            MarketplaceEscrowEntry.order_id == MarketplaceOrder.id,
        )
        .join(
            client_alias,
            MarketplaceOrder.client_id == client_alias.c.id,
        )
        .where(*base_filter)
        .order_by(MarketplaceEscrowEntry.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(query)).all()

    items = [
        CommissionEntry(
            order_id=row.order_id,
            client_name=row.client_name,
            order_amount_kopeks=row.order_amount_kopeks,
            commission_pct=float(row.worker_commission_pct),
            commission_amount_kopeks=row.amount_kopeks,
            date=row.created_at,
        )
        for row in rows
    ]

    return items, total


async def get_stats(
    db: AsyncSession,
    worker_id: uuid.UUID,
) -> WorkerMarketplaceStats:
    """Сводная статистика воркера на маркетплейсе.

    Возвращает:
    - total_earnings_kopeks: сумма всех комиссий (release_worker)
    - balance_kopeks: текущий баланс из user.marketplace_balance_kopeks
    - referral_count: количество приведённых заказчиков

    Args:
        db: Асинхронная сессия БД.
        worker_id: ID воркера.

    Returns:
        Объект WorkerMarketplaceStats.
    """
    # Сумма всех комиссий
    earnings_stmt = select(
        func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0)
    ).where(
        MarketplaceEscrowEntry.user_id == worker_id,
        MarketplaceEscrowEntry.entry_type == "release_worker",
    )
    total_earnings = int((await db.execute(earnings_stmt)).scalar_one())

    # Текущий баланс воркера
    balance_stmt = select(User.marketplace_balance_kopeks).where(User.id == worker_id)
    balance = (await db.execute(balance_stmt)).scalar_one_or_none()
    balance_kopeks = int(balance) if balance is not None else 0

    # Количество рефералов
    referral_count_stmt = select(func.count(User.id)).where(
        User.marketplace_referred_by == worker_id
    )
    referral_count = int((await db.execute(referral_count_stmt)).scalar_one())

    return WorkerMarketplaceStats(
        total_earnings_kopeks=total_earnings,
        balance_kopeks=balance_kopeks,
        referral_count=referral_count,
    )
