"""Сервис кабинета блогера на маркетплейсе (2-й уровень рефералки).

Предоставляет данные для дашборда блогера как реферера воркеров:
- Список приведённых воркеров (linked_to == blogger_id)
- История начислений комиссий 2-го уровня (release_blogger_referral)
- Сводная статистика (баланс, заработок, кол-во воркеров, отток на рефкомиссии)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_order import MarketplaceOrder
from models.user import User
from models.user_session import UserSession
from schemas.blogger_dashboard import (
    BloggerMarketplaceStats,
    RecruitedWorkerInfo,
)
from schemas.worker_dashboard import CommissionEntry

# Тип ledger-записи для комиссии блогера-реферера (2-й уровень)
_ENTRY_TYPE = "release_blogger_referral"


async def get_recruited_workers(
    db: AsyncSession,
    blogger_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[RecruitedWorkerInfo], int]:
    """Список воркеров, приведённых блогером (linked_to == blogger_id).

    Дата регистрации берётся из user_sessions (session_kind='register').
    Сортировка: новые сначала. Пагинация offset-based.
    """
    base_filter = [
        User.linked_to == blogger_id,
        User.role == UserRole.WORKER,
    ]

    count_stmt = select(func.count(User.id)).where(*base_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    reg_session = (
        select(
            UserSession.user_id,
            func.min(UserSession.created_at).label("registered_at"),
        )
        .where(UserSession.session_kind == "register")
        .group_by(UserSession.user_id)
        .subquery()
    )

    offset = (max(1, page) - 1) * page_size
    query = (
        select(
            User.id,
            User.name,
            reg_session.c.registered_at,
        )
        .outerjoin(reg_session, User.id == reg_session.c.user_id)
        .where(*base_filter)
        .order_by(reg_session.c.registered_at.desc().nullslast())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(query)).all()

    items = [
        RecruitedWorkerInfo(
            worker_id=row.id,
            worker_name=row.name,
            registered_at=row.registered_at or datetime.min.replace(tzinfo=None),
        )
        for row in rows
    ]

    return items, total


async def get_commission_history(
    db: AsyncSession,
    blogger_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[CommissionEntry], int]:
    """История начислений комиссий блогеру-рефереру (release_blogger_referral).

    Записи обогащаются данными заказа и заказчика. Сортировка: новые сначала.
    """
    base_filter = [
        MarketplaceEscrowEntry.user_id == blogger_id,
        MarketplaceEscrowEntry.entry_type == _ENTRY_TYPE,
    ]

    count_stmt = select(func.count(MarketplaceEscrowEntry.id)).where(*base_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    offset = (max(1, page) - 1) * page_size
    client_alias = User.__table__.alias("client")

    query = (
        select(
            MarketplaceEscrowEntry.order_id,
            MarketplaceEscrowEntry.amount_kopeks,
            MarketplaceEscrowEntry.created_at,
            MarketplaceOrder.amount_kopeks.label("order_amount_kopeks"),
            MarketplaceOrder.blogger_referrer_commission_pct,
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
            commission_pct=float(row.blogger_referrer_commission_pct),
            commission_amount_kopeks=row.amount_kopeks,
            date=row.created_at,
        )
        for row in rows
    ]

    return items, total


async def get_stats(
    db: AsyncSession,
    blogger_id: uuid.UUID,
) -> BloggerMarketplaceStats:
    """Сводная статистика блогера по 2-му уровню.

    - total_earnings_kopeks: сумма всех комиссий release_blogger_referral
    - balance_kopeks: текущий баланс из user.marketplace_balance_kopeks
    - recruited_workers_count: количество приведённых воркеров
    - referral_outflow_kopeks: сколько с заказов этого блогера (как продавца)
      ушло на рефкомиссии (release_worker + release_blogger_referral)
    """
    earnings_stmt = select(
        func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0)
    ).where(
        MarketplaceEscrowEntry.user_id == blogger_id,
        MarketplaceEscrowEntry.entry_type == _ENTRY_TYPE,
    )
    total_earnings = int((await db.execute(earnings_stmt)).scalar_one())

    balance_stmt = select(User.marketplace_balance_kopeks).where(User.id == blogger_id)
    balance = (await db.execute(balance_stmt)).scalar_one_or_none()
    balance_kopeks = int(balance) if balance is not None else 0

    workers_count_stmt = select(func.count(User.id)).where(
        User.linked_to == blogger_id,
        User.role == UserRole.WORKER,
    )
    recruited_workers_count = int((await db.execute(workers_count_stmt)).scalar_one())

    # Отток: рефкомиссии по заказам, где этот блогер — продавец (blogger_id)
    outflow_stmt = (
        select(func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0))
        .select_from(MarketplaceEscrowEntry)
        .join(
            MarketplaceOrder,
            MarketplaceEscrowEntry.order_id == MarketplaceOrder.id,
        )
        .where(
            MarketplaceOrder.blogger_id == blogger_id,
            MarketplaceEscrowEntry.entry_type.in_(
                ["release_worker", "release_blogger_referral"]
            ),
        )
    )
    referral_outflow_kopeks = int((await db.execute(outflow_stmt)).scalar_one())

    return BloggerMarketplaceStats(
        total_earnings_kopeks=total_earnings,
        balance_kopeks=balance_kopeks,
        recruited_workers_count=recruited_workers_count,
        referral_outflow_kopeks=referral_outflow_kopeks,
    )
