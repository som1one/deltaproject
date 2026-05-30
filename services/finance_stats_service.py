"""Сервис финансовой статистики платформы (Req 8).

Все денежные значения — целые копейки; преобразование в рубли выполняет только UI.
Финансовые доли платформы выводятся из посделочных записей журнала
(`ledger_entries`, шаблоны `idempotency_key` вида `deal:{id}:paid:{role}`),
а не из «сырого» `User.balance` — см. design.md, расследование дефекта Req 6.

Структура файла:
- `_period_threshold` — нижняя граница периода агрегации;
- `get_platform_finance_dashboard` — сборка дашборда.

Базовые показатели реализованы задачей 12.2. Группы A–G заполнены задачами
12.3–12.8: оборот/сделки/обязательства (A/B), разбивка доли платформы (C),
динамика (D), топ-участники (E), ожидаемые начисления (F), реферальная
аналитика (G).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.deal import Deal
from models.ledger_entry import LedgerEntry
from models.user import User
from schemas.finance import (
    ActiveReferralLinks,
    PlatformFinanceDashboard,
    ReferralShareByBlogger,
    ReportingPeriod,
    TimeSeriesPoint,
    TopParticipant,
)
from services.finance_scheme_service import (
    distribute_price_kopeks,
    get_or_create_scheme_for_blogger,
)

# Шаблоны idempotency_key посделочных начислений (источник истины для долей).
_KEY_PLATFORM = "deal:%:paid:platform"
_KEY_WORKER = "deal:%:paid:worker"
_KEY_BLOGER = "deal:%:paid:bloger"
_KEY_UPLINE = "deal:%:paid:upline"

# Сделки, считающиеся оплаченными (Оплаченная_Сделка): PAID + COMPLETED.
_PAID_STATUSES = (DealStatus.PAID, DealStatus.COMPLETED)


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
    threshold = _period_threshold(period, now)

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
    # Базовая_Сумма: согласованное выражение для всех агрегатов оборота.
    base_amount = func.coalesce(Deal.agreed_price_kopeks, Deal.price)

    # ============================================================
    # Базовые показатели (задача 12.2 — не изменяются)
    # ============================================================

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

    # ============================================================
    # Группа A — оборот и сделки (Req 8.9–8.14) [задача 12.3]
    # Период применяется по Deal.created_at, когда threshold задан.
    # ============================================================

    # turnover_total_kopeks: Σ Базовой_Суммы оплаченных сделок (Req 8.9).
    turnover_stmt = select(func.coalesce(func.sum(base_amount), 0)).where(
        Deal.status.in_(_PAID_STATUSES),
    )
    if threshold is not None:
        turnover_stmt = turnover_stmt.where(Deal.created_at >= threshold)
    turnover_total_kopeks = int((await db.execute(turnover_stmt)).scalar_one())

    # turnover_by_status_kopeks: Σ Базовой_Суммы по каждому статусу (Req 8.10).
    # Все 6 статусов всегда присутствуют (0 при отсутствии).
    turnover_by_status_kopeks: dict[str, int] = {s.value: 0 for s in DealStatus}
    turnover_rows_stmt = select(Deal.status, func.coalesce(func.sum(base_amount), 0)).group_by(
        Deal.status,
    )
    if threshold is not None:
        turnover_rows_stmt = turnover_rows_stmt.where(Deal.created_at >= threshold)
    for st, total in (await db.execute(turnover_rows_stmt)).all():
        turnover_by_status_kopeks[st.value] = int(total)

    # deal_counts_by_status: количество сделок по каждому статусу (Req 8.11).
    deal_counts_by_status: dict[str, int] = {s.value: 0 for s in DealStatus}
    count_rows_stmt = select(Deal.status, func.count(Deal.id)).group_by(Deal.status)
    if threshold is not None:
        count_rows_stmt = count_rows_stmt.where(Deal.created_at >= threshold)
    for st, cnt in (await db.execute(count_rows_stmt)).all():
        deal_counts_by_status[st.value] = int(cnt)

    # paid_deals_count: число оплаченных сделок (делитель средних), с учётом периода.
    paid_deals_count = (
        deal_counts_by_status[DealStatus.PAID.value]
        + deal_counts_by_status[DealStatus.COMPLETED.value]
    )

    # average_order_value_kopeks: средний чек, целое деление, 0 при отсутствии (Req 8.12–8.13).
    average_order_value_kopeks = (
        turnover_total_kopeks // paid_deals_count if paid_deals_count > 0 else 0
    )

    # average_platform_commission_kopeks: средняя доля платформы по оплаченным сделкам
    # (Req 8.13–8.14). Сумма долей платформы берётся из посделочных начислений
    # (LIKE 'deal:%:paid:platform', completed), ограниченных оплаченными сделками
    # периода через join к deals по deal_id — так делитель и числитель согласованы.
    platform_share_paid_stmt = (
        select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0))
        .select_from(LedgerEntry)
        .join(Deal, LedgerEntry.deal_id == Deal.id)
        .where(
            LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
            LedgerEntry.status == completed,
            Deal.status.in_(_PAID_STATUSES),
        )
    )
    if threshold is not None:
        platform_share_paid_stmt = platform_share_paid_stmt.where(Deal.created_at >= threshold)
    platform_share_paid_kopeks = int((await db.execute(platform_share_paid_stmt)).scalar_one())
    average_platform_commission_kopeks = (
        platform_share_paid_kopeks // paid_deals_count if paid_deals_count > 0 else 0
    )

    # ============================================================
    # Группа B — обязательства платформы (Req 8.15–8.16) [задача 12.3]
    # Без периода — текущие балансы.
    # ============================================================

    # platform_liabilities_kopeks: Σ балансов Worker+Bloger (Req 8.15).
    platform_liabilities_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(User.balance), 0)).where(
                    User.role.in_((UserRole.WORKER, UserRole.BLOGER)),
                ),
            )
        ).scalar_one(),
    )

    # net_free_funds_kopeks: баланс платформы минус обязательства (Req 8.16). Может быть < 0.
    net_free_funds_kopeks = platform_balance_kopeks - platform_liabilities_kopeks

    # ============================================================
    # Группа C — разбивка доли платформы (Req 8.19–8.20) [задача 12.4]
    # accrued/withdrawn — из базовых (12.2).
    # ============================================================

    # platform_pending_funds_kopeks: средства платформы в ожидании (Req 8.19).
    platform_pending_funds_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                    LedgerEntry.user_id == platform.id,
                    LedgerEntry.status.in_(
                        (
                            LedgerEntryStatus.FREEZE,
                            LedgerEntryStatus.PENDING_CONFIRMATION,
                            LedgerEntryStatus.PAYOUT_REQUEST,
                        ),
                    ),
                ),
            )
        ).scalar_one(),
    )

    # available_for_payout_kopeks: доступно к выводу (Req 8.20). Может быть < 0.
    available_for_payout_kopeks = (
        accrued_platform_share_kopeks - platform_withdrawn_kopeks - platform_pending_funds_kopeks
    )

    # ============================================================
    # Группа D — динамика (Req 8.24) [задача 12.5]
    # Слияние дневного оборота и дневной доли платформы в пределах периода.
    # ============================================================

    # Дневной оборот: group_by date(Deal.created_at) по оплаченным сделкам.
    daily_turnover_stmt = (
        select(func.date(Deal.created_at), func.coalesce(func.sum(base_amount), 0))
        .where(Deal.status.in_(_PAID_STATUSES))
        .group_by(func.date(Deal.created_at))
    )
    if threshold is not None:
        daily_turnover_stmt = daily_turnover_stmt.where(Deal.created_at >= threshold)
    daily_turnover: dict[object, int] = {}
    for day, total in (await db.execute(daily_turnover_stmt)).all():
        daily_turnover[day] = int(total)

    # Дневная накопленная доля платформы: group_by date(LedgerEntry.created_at).
    daily_accrued_stmt = (
        select(func.date(LedgerEntry.created_at), func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0))
        .where(
            LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
            LedgerEntry.status == completed,
        )
        .group_by(func.date(LedgerEntry.created_at))
    )
    if threshold is not None:
        daily_accrued_stmt = daily_accrued_stmt.where(LedgerEntry.created_at >= threshold)
    daily_accrued: dict[object, int] = {}
    for day, total in (await db.execute(daily_accrued_stmt)).all():
        daily_accrued[day] = int(total)

    # Слияние по дате; день, присутствующий в одном ряду, получает 0 в другом.
    all_days = sorted(set(daily_turnover) | set(daily_accrued))
    time_series = [
        TimeSeriesPoint(
            date=day,
            turnover_kopeks=daily_turnover.get(day, 0),
            accrued_platform_share_kopeks=daily_accrued.get(day, 0),
        )
        for day in all_days
    ]

    # ============================================================
    # Группа E — топ-участники (Req 8.25–8.27) [задача 12.6]
    # ≤10 по убыванию заработка; пустой список при отсутствии начислений.
    # ============================================================

    async def _top_participants(like_pattern: str) -> list[TopParticipant]:
        earnings = func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)
        stmt = (
            select(
                LedgerEntry.user_id,
                earnings.label("earnings"),
                func.count(func.distinct(LedgerEntry.deal_id)).label("paid_deals"),
            )
            .where(
                LedgerEntry.idempotency_key.like(like_pattern),
                LedgerEntry.status == completed,
            )
            .group_by(LedgerEntry.user_id)
            .order_by(earnings.desc())
            .limit(10)
        )
        return [
            TopParticipant(
                user_id=row.user_id,
                earnings_kopeks=int(row.earnings),
                paid_deals_count=int(row.paid_deals),
            )
            for row in (await db.execute(stmt)).all()
        ]

    top_bloggers = await _top_participants(_KEY_BLOGER)
    top_workers = await _top_participants(_KEY_WORKER)

    # ============================================================
    # Группа F — ожидаемые начисления (Req 8.28–8.29) [задача 12.7]
    # По сделкам в статусе CONFIRMED (ещё не PAID).
    # ============================================================

    # expected_accruals_total_kopeks: Σ Базовых_Сумм сделок CONFIRMED (Req 8.28).
    expected_accruals_total_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(base_amount), 0)).where(
                    Deal.status == DealStatus.CONFIRMED,
                ),
            )
        ).scalar_one(),
    )

    # expected_future_shares_kopeks: прогноз долей по схеме блогера каждой CONFIRMED-сделки
    # (Req 8.29). Логика валидации аплайна совпадает с _accrue_paid_deal: при отсутствии
    # валидного аплайна (существующий Bloger ≠ сам блогер) доля upline сворачивается в bloger.
    expected_future_shares_kopeks: dict[str, int] = {
        "worker": 0,
        "bloger": 0,
        "upline": 0,
        "platform": 0,
    }
    confirmed_deals = list(
        (
            await db.execute(select(Deal).where(Deal.status == DealStatus.CONFIRMED))
        ).scalars().all(),
    )
    # Кэш проверки валидности аплайна по блогеру, чтобы не дёргать БД повторно.
    _upline_valid_cache: dict[uuid.UUID, bool] = {}
    for deal in confirmed_deals:
        scheme = await get_or_create_scheme_for_blogger(deal.bloger_id, db)
        amount = deal.agreed_price_kopeks if deal.agreed_price_kopeks is not None else deal.price
        wk, bk, uk, pk = distribute_price_kopeks(amount, scheme)

        upline_valid = _upline_valid_cache.get(deal.bloger_id)
        if upline_valid is None:
            upline_valid = False
            bloger_user = await db.get(User, deal.bloger_id)
            if bloger_user is not None and bloger_user.upline_blogger_id is not None:
                cand = await db.get(User, bloger_user.upline_blogger_id)
                if (
                    cand is not None
                    and cand.role == UserRole.BLOGER
                    and cand.id != deal.bloger_id
                ):
                    upline_valid = True
            _upline_valid_cache[deal.bloger_id] = upline_valid

        if not upline_valid:
            bk += uk
            uk = 0

        expected_future_shares_kopeks["worker"] += wk
        expected_future_shares_kopeks["bloger"] += bk
        expected_future_shares_kopeks["upline"] += uk
        expected_future_shares_kopeks["platform"] += pk

    # ============================================================
    # Группа G — реферальная аналитика (Req 8.30–8.32) [задача 12.8]
    # ============================================================

    # total_referral_share_to_uplines_kopeks: Σ начислений аплайнам (Req 8.30).
    total_referral_share_to_uplines_kopeks = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
                    LedgerEntry.idempotency_key.like(_KEY_UPLINE),
                    LedgerEntry.status == completed,
                ),
            )
        ).scalar_one(),
    )

    # referral_share_by_blogger: разбивка реф-доли по аплайн-блогерам (Req 8.31).
    referral_by_blogger_stmt = (
        select(
            LedgerEntry.user_id,
            func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0).label("amount"),
        )
        .where(
            LedgerEntry.idempotency_key.like(_KEY_UPLINE),
            LedgerEntry.status == completed,
        )
        .group_by(LedgerEntry.user_id)
        .order_by(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0).desc())
    )
    referral_share_by_blogger = [
        ReferralShareByBlogger(upline_blogger_id=row.user_id, amount_kopeks=int(row.amount))
        for row in (await db.execute(referral_by_blogger_stmt)).all()
    ]

    # active_referral_links: счётчики активных связей (Req 8.32).
    bloggers_with_upline = int(
        (
            await db.execute(
                select(func.count(User.id)).where(
                    User.role == UserRole.BLOGER,
                    User.upline_blogger_id.is_not(None),
                ),
            )
        ).scalar_one(),
    )
    workers_with_link = int(
        (
            await db.execute(
                select(func.count(User.id)).where(
                    User.role == UserRole.WORKER,
                    User.linked_to.is_not(None),
                ),
            )
        ).scalar_one(),
    )
    active_referral_links = ActiveReferralLinks(
        bloggers_with_upline=bloggers_with_upline,
        workers_with_link=workers_with_link,
    )

    return PlatformFinanceDashboard(
        period=period,
        # Базовые показатели (12.2)
        platform_balance_kopeks=platform_balance_kopeks,
        net_profit_kopeks=net_profit_kopeks,
        earnings_by_role_kopeks=earnings_by_role_kopeks,
        total_completed_payouts_kopeks=total_completed_payouts_kopeks,
        # A. Оборот и сделки (12.3)
        turnover_total_kopeks=turnover_total_kopeks,
        turnover_by_status_kopeks=turnover_by_status_kopeks,
        deal_counts_by_status=deal_counts_by_status,
        average_order_value_kopeks=average_order_value_kopeks,
        average_platform_commission_kopeks=average_platform_commission_kopeks,
        # B. Обязательства (12.3)
        platform_liabilities_kopeks=platform_liabilities_kopeks,
        net_free_funds_kopeks=net_free_funds_kopeks,
        # C. Разбивка доли платформы (12.2 + 12.4)
        accrued_platform_share_kopeks=accrued_platform_share_kopeks,
        platform_withdrawn_kopeks=platform_withdrawn_kopeks,
        platform_pending_funds_kopeks=platform_pending_funds_kopeks,
        available_for_payout_kopeks=available_for_payout_kopeks,
        # D. Динамика (12.5)
        time_series=time_series,
        # E. Топ-участники (12.6)
        top_bloggers=top_bloggers,
        top_workers=top_workers,
        # F. Ожидаемые начисления (12.7)
        expected_accruals_total_kopeks=expected_accruals_total_kopeks,
        expected_future_shares_kopeks=expected_future_shares_kopeks,
        # G. Реферальная аналитика (12.8)
        total_referral_share_to_uplines_kopeks=total_referral_share_to_uplines_kopeks,
        referral_share_by_blogger=referral_share_by_blogger,
        active_referral_links=active_referral_links,
    )
