"""Сервис финансовой статистики платформы (Req 8).

Все денежные значения — целые копейки; преобразование в рубли выполняет только UI.
Финансовые доли платформы выводятся из посделочных записей журнала
(`ledger_entries`, шаблоны `idempotency_key` вида `deal:{id}:paid:{role}`),
а не из «сырого» `User.balance` — см. design.md, расследование дефекта Req 6.

Структура файла:
- `_period_threshold` — нижняя граница периода агрегации;
- `get_platform_finance_dashboard` — сборка дашборда.

Текущая задача (12.2) реализует предусловия и базовые показатели. Остальные группы
показателей (A–G, динамика, топ-участники, ожидаемые начисления, реферальная
аналитика) пока возвращают безопасные значения по умолчанию и будут заполнены
задачами 12.3–12.8 (см. TODO-метки ниже).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from models.ledger_entry import LedgerEntry
from models.user import User
from schemas.finance import (
    ActiveReferralLinks,
    PlatformFinanceDashboard,
    ReportingPeriod,
)

# Шаблоны idempotency_key посделочных начислений (источник истины для долей).
_KEY_PLATFORM = "deal:%:paid:platform"
_KEY_WORKER = "deal:%:paid:worker"
_KEY_BLOGER = "deal:%:paid:bloger"
_KEY_UPLINE = "deal:%:paid:upline"


def _period_threshold(period: ReportingPeriod, now: datetime) -> datetime | None:
    """Нижняя граница периода агрегации (включительно) либо None для `all`.

    - TODAY → начало текущих суток (UTC);
    - WEEK  → now - 7 дней;
    - MONTH → now - 30 дней;
    - ALL   → None (временной фильтр не применяется, Req 8.22).
    """
    if period is ReportingPeriod.TODAY:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period is ReportingPeriod.WEEK:
        return now - timedelta(days=7)
    if period is ReportingPeriod.MONTH:
        return now - timedelta(days=30)
    return None


async def get_platform_finance_dashboard(
    db: AsyncSession,
    period: ReportingPeriod = ReportingPeriod.ALL,
) -> PlatformFinanceDashboard:
    """Собрать финансовый дашборд платформы.

    Предусловие (Req 8.3): системный счёт платформы должен существовать; иначе —
    ошибка конфигурации до любых агрегатов, без частичных данных.
    """
    now = datetime.now(timezone.utc)
    _threshold = _period_threshold(period, now)  # noqa: F841 — используется задачами 12.3–12.8

    # --- Предусловие: системный счёт платформы (Req 8.3) ---
    # Проверяется ДО любых агрегатов, чтобы не возвращать частичные показатели.
    platform = await db.get(User, settings.platform_revenue_user_id)
    if platform is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Системный счёт платформы не сконфигурирован "
                "(settings.platform_revenue_user_id не найден)"
            ),
        )

    completed = LedgerEntryStatus.COMPLETED

    # --- Базовые показатели ---

    # platform_balance_kopeks: баланс платформы до вывода (Req 8.5).
    platform_balance_kopeks = int(platform.balance)

    # accrued_platform_share_kopeks: Σ посделочных начислений платформе (Req 8.17).
    accrued_platform_share_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                    LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
                    LedgerEntry.status == completed,
                ),
            )
        ).scalar_one(),
    )

    # platform_withdrawn_kopeks: завершённые выплаты платформы (Req 8.18).
    platform_withdrawn_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                    LedgerEntry.user_id == platform.id,
                    LedgerEntry.deal_id.is_(None),
                    LedgerEntry.status == completed,
                ),
            )
        ).scalar_one(),
    )

    # net_profit_kopeks: накопленная доля за вычетом выведенного (Req 8.6).
    net_profit_kopeks = accrued_platform_share_kopeks - platform_withdrawn_kopeks

    # earnings_by_role_kopeks: заработок по ролям из посделочных начислений (Req 8.7).
    # Всегда содержит все три ключа (0 при отсутствии начислений).
    earnings_by_role_kopeks: dict[str, int] = {"Worker": 0, "Bloger": 0, "Platform": 0}
    for role_key, like_pattern in (
        ("Worker", _KEY_WORKER),
        ("Bloger", _KEY_BLOGER),
        ("Platform", _KEY_PLATFORM),
    ):
        earnings_by_role_kopeks[role_key] = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                        LedgerEntry.idempotency_key.like(like_pattern),
                        LedgerEntry.status == completed,
                    ),
                )
            ).scalar_one(),
        )

    # total_completed_payouts_kopeks: все завершённые выплаты (Req 8.8).
    total_completed_payouts_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                    LedgerEntry.deal_id.is_(None),
                    LedgerEntry.status == completed,
                ),
            )
        ).scalar_one(),
    )

    # --- Значения по умолчанию для ещё не реализованных групп ---
    # Словари статусов содержат все 6 ключей DealStatus с нулём.
    _zero_by_status: dict[str, int] = {s.value: 0 for s in DealStatus}

    return PlatformFinanceDashboard(
        period=period,
        # Базовые показатели (реализованы в 12.2)
        platform_balance_kopeks=platform_balance_kopeks,
        net_profit_kopeks=net_profit_kopeks,
        earnings_by_role_kopeks=earnings_by_role_kopeks,
        total_completed_payouts_kopeks=total_completed_payouts_kopeks,
        # TODO(12.3): группа A — оборот, сделки, средний чек/комиссия (Req 8.9–8.14)
        turnover_total_kopeks=0,
        turnover_by_status_kopeks=dict(_zero_by_status),
        deal_counts_by_status=dict(_zero_by_status),
        average_order_value_kopeks=0,
        average_platform_commission_kopeks=0,
        # TODO(12.3): группа B — обязательства платформы и чистые свободные средства (Req 8.15–8.16)
        platform_liabilities_kopeks=0,
        net_free_funds_kopeks=0,
        # Группа C — разбивка доли платформы.
        # accrued/withdrawn реализованы в 12.2; pending/available — TODO(12.4) (Req 8.19–8.20)
        accrued_platform_share_kopeks=accrued_platform_share_kopeks,
        platform_withdrawn_kopeks=platform_withdrawn_kopeks,
        platform_pending_funds_kopeks=0,  # TODO(12.4): Req 8.19
        available_for_payout_kopeks=0,  # TODO(12.4): Req 8.20
        # TODO(12.5): группа D — динамика (Req 8.24)
        time_series=[],
        # TODO(12.6): группа E — топ-участники (Req 8.25–8.27)
        top_bloggers=[],
        top_workers=[],
        # TODO(12.7): группа F — ожидаемые начисления (Req 8.28–8.29)
        expected_accruals_total_kopeks=0,
        expected_future_shares_kopeks={"worker": 0, "bloger": 0, "upline": 0, "platform": 0},
        # TODO(12.8): группа G — реферальная аналитика (Req 8.30–8.32)
        total_referral_share_to_uplines_kopeks=0,
        referral_share_by_blogger=[],
        active_referral_links=ActiveReferralLinks(bloggers_with_upline=0, workers_with_link=0),
    )
