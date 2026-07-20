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
аналитика (G). Группа H — расширенная аналитика периода: сравнение с
предыдущим отрезком, воронка, доли/конверсии, чеки, люди, очередь выплат,
теплокарта создания сделок.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date as date_cls, datetime, timedelta, timezone
from statistics import median

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
    AmountBucket,
    FunnelStage,
    ParticipantCounts,
    PayoutQueue,
    PeriodComparison,
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

# Длина периода для сравнения с предыдущим отрезком (группа H).
_PERIOD_SPAN: dict[ReportingPeriod, timedelta] = {
    ReportingPeriod.TODAY: timedelta(days=1),
    ReportingPeriod.WEEK: timedelta(days=7),
    ReportingPeriod.MONTH: timedelta(days=30),
}

# Порядок «живого» цикла сделки. REJECTED/REFUNDED — съезды с воронки, ранга не имеют.
_FUNNEL_RANK: dict[DealStatus, int] = {
    DealStatus.NEW: 0,
    DealStatus.REVIEW: 1,
    DealStatus.CONFIRMED: 2,
    DealStatus.ESCROW_HELD: 3,
    DealStatus.PAID: 4,
    DealStatus.COMPLETED: 5,
}
_FUNNEL_STAGES: tuple[tuple[str, int], ...] = (
    ("created", 0),
    ("review", 1),
    ("confirmed", 2),
    ("escrow", 3),
    ("paid", 4),
    ("completed", 5),
)

# Корзины гистограммы чеков: (верхняя граница в копейках или None, подпись).
_AMOUNT_BUCKETS: tuple[tuple[int | None, str], ...] = (
    (100_000, "до 1 тыс"),
    (300_000, "1–3 тыс"),
    (500_000, "3–5 тыс"),
    (1_000_000, "5–10 тыс"),
    (2_500_000, "10–25 тыс"),
    (5_000_000, "25–50 тыс"),
    (None, "50 тыс+"),
)

# Московское время для теплокарты — админы читают её в своём часовом поясе.
_MSK = timezone(timedelta(hours=3))

# Предохранитель для периода `all`: длинный ряд по дням превратится в мегабайты JSON.
_MAX_SERIES_DAYS = 400


def _as_utc(value: datetime) -> datetime:
    """Привести отметку времени к aware-UTC (SQLite отдаёт naive)."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _pct(part: int, whole: int) -> float:
    """Доля в процентах, округлённая до сотых; 0.0 при нулевом знаменателе."""
    return round(part / whole * 100, 2) if whole > 0 else 0.0


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

    # Сырые строки сделок периода: один проход обслуживает и динамику (D),
    # и расширенную аналитику (H) — чеки, воронку, теплокарту, сроки.
    # Группировка по дням делается в Python: func.date() возвращает date в
    # PostgreSQL и строку в SQLite, а ряд нужно достраивать нулями по датам.
    deal_rows_stmt = select(
        Deal.created_at,
        Deal.client_contacted_at,
        Deal.status,
        base_amount.label("amount"),
    )
    if threshold is not None:
        deal_rows_stmt = deal_rows_stmt.where(Deal.created_at >= threshold)
    deal_rows = (await db.execute(deal_rows_stmt)).all()

    # Дневной оборот и счётчики сделок по дате создания.
    daily_turnover: dict[date_cls, int] = defaultdict(int)
    daily_created: dict[date_cls, int] = defaultdict(int)
    daily_paid: dict[date_cls, int] = defaultdict(int)
    for row in deal_rows:
        day = _as_utc(row.created_at).date()
        daily_created[day] += 1
        if row.status in _PAID_STATUSES:
            daily_turnover[day] += int(row.amount)
            daily_paid[day] += 1

    # Дневная доля платформы по дате начисления. Вместе с ней берём базовую сумму
    # самой сделки: это «деньги, прошедшие в этот день», и только с ними доля
    # платформы сходится в проценты. Когортный оборот выше отвечает на другой
    # вопрос — «сколько стоят сделки, заведённые в этот день».
    accrual_stmt = (
        select(
            LedgerEntry.created_at,
            LedgerEntry.amount_kopeks,
            base_amount.label("deal_amount"),
        )
        .select_from(LedgerEntry)
        .join(Deal, LedgerEntry.deal_id == Deal.id)
        .where(
            LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
            LedgerEntry.status == completed,
        )
    )
    if threshold is not None:
        accrual_stmt = accrual_stmt.where(LedgerEntry.created_at >= threshold)
    daily_accrued: dict[date_cls, int] = defaultdict(int)
    daily_turnover_paid: dict[date_cls, int] = defaultdict(int)
    daily_payments: dict[date_cls, int] = defaultdict(int)
    for created_at, amount, deal_amount in (await db.execute(accrual_stmt)).all():
        day = _as_utc(created_at).date()
        daily_accrued[day] += int(amount)
        daily_turnover_paid[day] += int(deal_amount)
        daily_payments[day] += 1

    # Ряд достраивается нулями по всем дням периода: пропуск дня в графике
    # читается как «данных нет», а не «оборот упал».
    observed_days = set(daily_created) | set(daily_accrued)
    end_day = now.date()
    if threshold is not None:
        start_day = threshold.date()
    else:
        start_day = min(observed_days) if observed_days else end_day
    if (end_day - start_day).days > _MAX_SERIES_DAYS:
        start_day = end_day - timedelta(days=_MAX_SERIES_DAYS)
    span_days = max((end_day - start_day).days, 0)
    time_series = [
        TimeSeriesPoint(
            date=day,
            turnover_kopeks=daily_turnover.get(day, 0),
            accrued_platform_share_kopeks=daily_accrued.get(day, 0),
            deals_created=daily_created.get(day, 0),
            paid_deals_count=daily_paid.get(day, 0),
            turnover_paid_kopeks=daily_turnover_paid.get(day, 0),
            payments_count=daily_payments.get(day, 0),
        )
        for day in (start_day + timedelta(days=offset) for offset in range(span_days + 1))
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
                User.name,
                User.nickname,
            )
            .join(User, User.id == LedgerEntry.user_id)
            .where(
                LedgerEntry.idempotency_key.like(like_pattern),
                LedgerEntry.status == completed,
            )
            .group_by(LedgerEntry.user_id, User.name, User.nickname)
            .order_by(earnings.desc())
            .limit(10)
        )
        return [
            TopParticipant(
                user_id=row.user_id,
                earnings_kopeks=int(row.earnings),
                paid_deals_count=int(row.paid_deals),
                name=row.name,
                nickname=row.nickname,
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
            User.name,
            User.nickname,
        )
        .join(User, User.id == LedgerEntry.user_id)
        .where(
            LedgerEntry.idempotency_key.like(_KEY_UPLINE),
            LedgerEntry.status == completed,
        )
        .group_by(LedgerEntry.user_id, User.name, User.nickname)
        .order_by(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0).desc())
    )
    referral_share_by_blogger = [
        ReferralShareByBlogger(
            upline_blogger_id=row.user_id,
            amount_kopeks=int(row.amount),
            name=row.name,
            nickname=row.nickname,
        )
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

    # ============================================================
    # Группа H — расширенная аналитика периода
    # В отличие от накопительных показателей выше, всё здесь считается внутри
    # выбранного периода, чтобы переключатель менял картину целиком.
    # ============================================================

    # H1. Когорта периода и воронка по текущему статусу сделки.
    # Воронка строится на текущем статусе: сделка, доехавшая до PAID, засчитана
    # и во все предыдущие шаги. REJECTED/REFUNDED — съезды, они видны только в
    # шаге «создано» (пройденные ими шаги история не хранит).
    deals_created_period = sum(deal_counts_by_status.values())
    rank_counts: dict[int, int] = defaultdict(int)
    for status_value, cnt in deal_counts_by_status.items():
        rank = _FUNNEL_RANK.get(DealStatus(status_value))
        if rank is not None:
            rank_counts[rank] += cnt
    funnel = [
        FunnelStage(
            key=key,
            count=(
                deals_created_period
                if key == "created"
                else sum(cnt for rank, cnt in rank_counts.items() if rank >= min_rank)
            ),
        )
        for key, min_rank in _FUNNEL_STAGES
    ]

    # H2. Доли и конверсии периода. Take rate считается на деньгах, реально
    # прошедших в периоде: числитель и знаменатель на одной базе, поэтому
    # «доход ÷ оборот» в интерфейсе сходится с показанным процентом.
    turnover_paid_period_kopeks = sum(daily_turnover_paid.values())
    payments_period_count = sum(daily_payments.values())
    rejected_count = deal_counts_by_status.get(DealStatus.REJECTED.value, 0)
    refunded_count = deal_counts_by_status.get(DealStatus.REFUNDED.value, 0)
    take_rate_pct = _pct(sum(daily_accrued.values()), turnover_paid_period_kopeks)
    conversion_to_paid_pct = _pct(paid_deals_count, deals_created_period)
    rejection_rate_pct = _pct(rejected_count, deals_created_period)
    refund_rate_pct = _pct(refunded_count, deals_created_period)

    # H3. Чеки, срок до контакта и теплокарта — из уже загруженных строк сделок.
    paid_amounts = sorted(int(row.amount) for row in deal_rows if row.status in _PAID_STATUSES)
    median_order_value_kopeks = int(median(paid_amounts)) if paid_amounts else 0
    max_order_value_kopeks = paid_amounts[-1] if paid_amounts else 0

    bucket_counts = [0] * len(_AMOUNT_BUCKETS)
    bucket_sums = [0] * len(_AMOUNT_BUCKETS)
    for amount in paid_amounts:
        for index, (upper, _label) in enumerate(_AMOUNT_BUCKETS):
            if upper is None or amount < upper:
                bucket_counts[index] += 1
                bucket_sums[index] += amount
                break
    amounts_histogram = [
        AmountBucket(label=label, count=bucket_counts[index], amount_kopeks=bucket_sums[index])
        for index, (_upper, label) in enumerate(_AMOUNT_BUCKETS)
    ]

    deals_heatmap = [[0] * 24 for _ in range(7)]
    contact_lags: list[float] = []
    for row in deal_rows:
        created_utc = _as_utc(row.created_at)
        created_msk = created_utc.astimezone(_MSK)
        deals_heatmap[created_msk.weekday()][created_msk.hour] += 1
        if row.client_contacted_at is not None:
            lag = (_as_utc(row.client_contacted_at) - created_utc).total_seconds() / 3600
            if lag >= 0:
                contact_lags.append(lag)
    avg_hours_to_first_contact = (
        round(sum(contact_lags) / len(contact_lags), 1) if contact_lags else None
    )

    # H4. Срок до распределения долей: отметка начисления платформе минус создание сделки.
    payment_lag_stmt = (
        select(Deal.created_at, LedgerEntry.created_at)
        .select_from(LedgerEntry)
        .join(Deal, LedgerEntry.deal_id == Deal.id)
        .where(
            LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
            LedgerEntry.status == completed,
        )
    )
    if threshold is not None:
        payment_lag_stmt = payment_lag_stmt.where(Deal.created_at >= threshold)
    payment_lags = [
        lag
        for deal_created, accrued_at in (await db.execute(payment_lag_stmt)).all()
        if (lag := (_as_utc(accrued_at) - _as_utc(deal_created)).total_seconds() / 3600) >= 0
    ]
    avg_hours_to_payment = (
        round(sum(payment_lags) / len(payment_lags), 1) if payment_lags else None
    )

    # H5. Начисления периода по ролям — по дате начисления, а не создания сделки.
    period_platform_share_kopeks = sum(daily_accrued.values())
    earnings_by_role_period_kopeks: dict[str, int] = {
        "Worker": 0,
        "Bloger": 0,
        "Upline": 0,
        "Platform": 0,
    }
    for role_key, like_pattern in (
        ("Worker", _KEY_WORKER),
        ("Bloger", _KEY_BLOGER),
        ("Upline", _KEY_UPLINE),
        ("Platform", _KEY_PLATFORM),
    ):
        role_period_stmt = select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
            LedgerEntry.idempotency_key.like(like_pattern),
            LedgerEntry.status == completed,
        )
        if threshold is not None:
            role_period_stmt = role_period_stmt.where(LedgerEntry.created_at >= threshold)
        earnings_by_role_period_kopeks[role_key] = int(
            (await db.execute(role_period_stmt)).scalar_one(),
        )

    # H6. Предыдущий отрезок для дельт. Длина берётся такая же, но окно
    # обрезается по фактически прошедшему времени: «сегодня к 14:00» сравнивается
    # со «вчера к 14:00», а не с полными сутками. Для `all` сравнивать не с чем.
    previous_period: PeriodComparison | None = None
    if threshold is not None:
        prev_start = threshold - _PERIOD_SPAN[period]
        prev_end = prev_start + (now - threshold)
        prev_window = (Deal.created_at >= prev_start, Deal.created_at < prev_end)
        prev_turnover = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(base_amount), 0)).where(
                        Deal.status.in_(_PAID_STATUSES),
                        *prev_window,
                    ),
                )
            ).scalar_one(),
        )
        prev_created = int(
            (await db.execute(select(func.count(Deal.id)).where(*prev_window))).scalar_one(),
        )
        prev_paid = int(
            (
                await db.execute(
                    select(func.count(Deal.id)).where(
                        Deal.status.in_(_PAID_STATUSES),
                        *prev_window,
                    ),
                )
            ).scalar_one(),
        )
        prev_accrual_stmt = (
            select(
                func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0),
                func.coalesce(func.sum(base_amount), 0),
            )
            .select_from(LedgerEntry)
            .join(Deal, LedgerEntry.deal_id == Deal.id)
            .where(
                LedgerEntry.idempotency_key.like(_KEY_PLATFORM),
                LedgerEntry.status == completed,
                LedgerEntry.created_at >= prev_start,
                LedgerEntry.created_at < prev_end,
            )
        )
        prev_share, prev_turnover_paid = (await db.execute(prev_accrual_stmt)).one()
        previous_period = PeriodComparison(
            turnover_kopeks=prev_turnover,
            turnover_paid_kopeks=int(prev_turnover_paid),
            platform_share_kopeks=int(prev_share),
            deals_created=prev_created,
            paid_deals_count=prev_paid,
        )

    # H7. Люди платформы: сколько всего и сколько реально работало в периоде.
    role_totals: dict[str, int] = defaultdict(int)
    for role, cnt in (
        await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    ).all():
        role_totals[role.value] += int(cnt)
    banned_total = int(
        (
            await db.execute(select(func.count(User.id)).where(User.banned_at.is_not(None)))
        ).scalar_one(),
    )

    async def _active_participants(column) -> int:
        """Уникальные участники оплаченных сделок периода."""
        stmt = select(func.count(func.distinct(column))).where(Deal.status.in_(_PAID_STATUSES))
        if threshold is not None:
            stmt = stmt.where(Deal.created_at >= threshold)
        return int((await db.execute(stmt)).scalar_one())

    participants = ParticipantCounts(
        workers_total=role_totals.get(UserRole.WORKER.value, 0),
        bloggers_total=role_totals.get(UserRole.BLOGER.value, 0),
        clients_total=role_totals.get(UserRole.CLIENT.value, 0),
        active_workers=await _active_participants(Deal.worker_id),
        active_bloggers=await _active_participants(Deal.bloger_id),
        banned_total=banned_total,
    )

    # H8. Очередь выплат — снимок на сейчас, период не применяется.
    _PENDING_PAYOUT_STATUSES = (
        LedgerEntryStatus.PAYOUT_REQUEST,
        LedgerEntryStatus.PENDING_CONFIRMATION,
        LedgerEntryStatus.FREEZE,
    )
    pending_count = 0
    pending_kopeks = 0
    completed_payout_count = 0
    completed_payout_kopeks = 0
    rejected_payout_count = 0
    payout_rows = (
        await db.execute(
            select(
                LedgerEntry.status,
                func.count(LedgerEntry.id),
                func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0),
            )
            .where(LedgerEntry.deal_id.is_(None))
            .group_by(LedgerEntry.status),
        )
    ).all()
    for entry_status, cnt, total in payout_rows:
        if entry_status in _PENDING_PAYOUT_STATUSES:
            pending_count += int(cnt)
            pending_kopeks += int(total)
        elif entry_status == LedgerEntryStatus.COMPLETED:
            completed_payout_count = int(cnt)
            completed_payout_kopeks = int(total)
        elif entry_status == LedgerEntryStatus.REJECTED:
            rejected_payout_count = int(cnt)
    payouts = PayoutQueue(
        pending_count=pending_count,
        pending_kopeks=pending_kopeks,
        completed_count=completed_payout_count,
        completed_kopeks=completed_payout_kopeks,
        rejected_count=rejected_payout_count,
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
        # H. Расширенная аналитика периода
        deals_created_period=deals_created_period,
        paid_deals_period=paid_deals_count,
        turnover_paid_period_kopeks=turnover_paid_period_kopeks,
        payments_period_count=payments_period_count,
        period_platform_share_kopeks=period_platform_share_kopeks,
        earnings_by_role_period_kopeks=earnings_by_role_period_kopeks,
        previous_period=previous_period,
        funnel=funnel,
        take_rate_pct=take_rate_pct,
        conversion_to_paid_pct=conversion_to_paid_pct,
        rejection_rate_pct=rejection_rate_pct,
        refund_rate_pct=refund_rate_pct,
        avg_hours_to_payment=avg_hours_to_payment,
        avg_hours_to_first_contact=avg_hours_to_first_contact,
        median_order_value_kopeks=median_order_value_kopeks,
        max_order_value_kopeks=max_order_value_kopeks,
        amounts_histogram=amounts_histogram,
        participants=participants,
        payouts=payouts,
        deals_heatmap=deals_heatmap,
    )
