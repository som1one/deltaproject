"""Сервис большой статистики маркетплейса для админ-панели.

Собирает в один ответ KPI-сводку, дневные ряды, распределения, топы и
теплокарту активности. Дни считаются по МСК (фиксированный UTC+3 — в России
нет сезонного перевода часов), чтобы «сегодня» совпадало с ощущением админа.

Приём с таймзонами: колонки timestamptz переводим в наивный UTC через
``timezone('UTC', col)`` и прибавляем 3 часа — результат не зависит от
таймзоны сессии PostgreSQL.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.marketplace import (
    AudienceSubmissionStatus,
    MarketplaceOrderStatus,
    PremiumRequestStatus,
    SupportTicketStatus,
    SupportTicketSubject,
    WithdrawalStatus,
)
from enums.user import UserRole
from models.blogger_audience_submission import BloggerAudienceSubmission
from models.blogger_profile import BloggerProfile
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_message import MarketplaceMessage
from models.marketplace_order import MarketplaceOrder
from models.marketplace_premium_request import MarketplacePremiumRequest
from models.marketplace_review import MarketplaceReview
from models.marketplace_withdrawal import MarketplaceWithdrawal
from models.support_ticket import SupportTicket
from models.user import User
from models.user_session import UserSession
from schemas.marketplace_stats import (
    AmountBucket,
    DailyCountPoint,
    DailyMoneyPoint,
    DailyNewUsersPoint,
    FunnelStage,
    MarketplaceStatsResponse,
    MarketplaceStatsSummary,
    RatingBucket,
    ServiceTypeSlice,
    StatusSlice,
    TopBloggerItem,
    TopClientItem,
)

MSK = timezone(timedelta(hours=3))

# Корзины гистограммы чеков: (верхняя граница в копейках, подпись)
_AMOUNT_BUCKETS: list[tuple[int | None, str]] = [
    (1_000_00, "до 1 тыс"),
    (3_000_00, "1–3 тыс"),
    (5_000_00, "3–5 тыс"),
    (10_000_00, "5–10 тыс"),
    (25_000_00, "10–25 тыс"),
    (50_000_00, "25–50 тыс"),
    (100_000_00, "50–100 тыс"),
    (None, "100 тыс +"),
]


def _day(col):
    """День МСК для timestamptz-колонки, независимо от таймзоны сессии PG."""
    return func.date_trunc("day", func.timezone("UTC", col) + timedelta(hours=3))


def _fill_counts(rows: dict[str, int], start: date, days: int) -> list[DailyCountPoint]:
    return [
        DailyCountPoint(date=iso, count=rows.get(iso, 0))
        for iso in ((start + timedelta(days=i)).isoformat() for i in range(days))
    ]


def _fill_money(
    rows: dict[str, tuple[int, int]], start: date, days: int
) -> list[DailyMoneyPoint]:
    return [
        DailyMoneyPoint(
            date=iso,
            count=rows.get(iso, (0, 0))[0],
            amount_kopeks=rows.get(iso, (0, 0))[1],
        )
        for iso in ((start + timedelta(days=i)).isoformat() for i in range(days))
    ]


async def _count_series(
    db: AsyncSession, col, start_at: datetime, start: date, days: int, *extra_where
) -> list[DailyCountPoint]:
    """Дневной ряд «количество строк по дню col» с zero-fill."""
    day = _day(col).label("day")
    result = await db.execute(
        select(day, func.count())
        .where(col >= start_at, *extra_where)
        .group_by(day)
    )
    rows = {row[0].date().isoformat(): row[1] for row in result.all()}
    return _fill_counts(rows, start, days)


async def _money_series(
    db: AsyncSession, col, amount_col, start_at: datetime, start: date, days: int, *extra_where
) -> list[DailyMoneyPoint]:
    """Дневной ряд «количество + сумма по дню col» с zero-fill."""
    day = _day(col).label("day")
    result = await db.execute(
        select(day, func.count(), func.coalesce(func.sum(amount_col), 0))
        .where(col >= start_at, *extra_where)
        .group_by(day)
    )
    rows = {row[0].date().isoformat(): (row[1], int(row[2])) for row in result.all()}
    return _fill_money(rows, start, days)


async def get_marketplace_stats(db: AsyncSession, days: int) -> MarketplaceStatsResponse:
    now = datetime.now(timezone.utc)
    today_msk = now.astimezone(MSK).date()
    start_date = today_msk - timedelta(days=days - 1)
    start_at = datetime.combine(start_date, time.min, tzinfo=MSK)

    order = MarketplaceOrder

    # Момент оплаты. order.paid_at ставит только ЮKassa-вебхук; при ручном
    # подтверждении оплаты админом факт фиксируется freeze-записью леджера.
    # Поэтому «оплачен» = paid_at ∨ freeze.created_at ∨ completed_at (легаси).
    freeze_sq = (
        select(
            MarketplaceEscrowEntry.order_id.label("order_id"),
            func.min(MarketplaceEscrowEntry.created_at).label("frozen_at"),
        )
        .where(MarketplaceEscrowEntry.entry_type == "freeze")
        .group_by(MarketplaceEscrowEntry.order_id)
        .subquery()
    )
    paid_ts = func.coalesce(order.paid_at, freeze_sq.c.frozen_at, order.completed_at)

    def paid_join(stmt):
        return stmt.select_from(order).outerjoin(
            freeze_sq, freeze_sq.c.order_id == order.id
        )

    # --- Сводка по заказам: один проход с FILTER-агрегатами ---------------
    orders_row = (
        await db.execute(
            paid_join(
                select(
                    func.count(),
                    func.count().filter(order.created_at >= start_at),
                    func.coalesce(
                        func.sum(order.amount_kopeks).filter(paid_ts.is_not(None)), 0
                    ),
                    func.coalesce(
                        func.sum(order.amount_kopeks).filter(paid_ts >= start_at), 0
                    ),
                    func.count().filter(paid_ts >= start_at),
                    func.count().filter(order.completed_at.is_not(None)),
                    func.count().filter(order.completed_at >= start_at),
                    func.coalesce(
                        func.sum(order.amount_kopeks).filter(
                            order.refunded_at >= start_at
                        ),
                        0,
                    ),
                    func.count().filter(order.refunded_at >= start_at),
                    func.coalesce(
                        func.sum(order.amount_kopeks).filter(
                            order.status.in_(
                                [
                                    MarketplaceOrderStatus.ESCROW_HELD.value,
                                    MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
                                ]
                            )
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.avg(order.amount_kopeks).filter(paid_ts >= start_at), 0
                    ),
                    func.count(func.distinct(order.client_id)).filter(
                        paid_ts >= start_at
                    ),
                    func.avg(
                        func.extract("epoch", order.accepted_at - order.created_at)
                    ).filter(order.accepted_at >= start_at),
                    func.avg(func.extract("epoch", order.completed_at - paid_ts)).filter(
                        order.completed_at >= start_at, paid_ts.is_not(None)
                    ),
                )
            )
        )
    ).one()
    (
        orders_total,
        orders_period,
        gmv_total,
        gmv_period,
        paid_period,
        completed_total,
        completed_period,
        refunded_period_sum,
        refunded_period_count,
        escrow_now,
        avg_check,
        buyers_period,
        avg_accept_sec,
        avg_completion_sec,
    ) = orders_row

    # Повторные покупатели за период: >= 2 оплаченных заказов
    repeat_sq = (
        paid_join(select(order.client_id))
        .where(paid_ts >= start_at)
        .group_by(order.client_id)
        .having(func.count() >= 2)
        .subquery()
    )
    repeat_buyers = (
        await db.execute(select(func.count()).select_from(repeat_sq))
    ).scalar_one()

    # --- Доход платформы: фактические начисления из эскроу-леджера --------
    platform_row = (
        await db.execute(
            select(
                func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0),
                func.coalesce(
                    func.sum(MarketplaceEscrowEntry.amount_kopeks).filter(
                        MarketplaceEscrowEntry.created_at >= start_at
                    ),
                    0,
                ),
            ).where(MarketplaceEscrowEntry.entry_type == "release_platform")
        )
    ).one()
    platform_income_total, platform_income_period = platform_row

    # --- Люди -------------------------------------------------------------
    people_row = (
        await db.execute(
            select(
                func.count().filter(User.role == UserRole.CLIENT),
                func.coalesce(func.sum(User.marketplace_balance_kopeks), 0),
            )
        )
    ).one()
    clients_total, balances_owed = people_row

    bloggers_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(BloggerProfile.is_active.is_(True)),
                func.count().filter(BloggerProfile.created_at >= start_at),
            )
        )
    ).one()
    bloggers_total, active_bloggers, new_bloggers_period = bloggers_row

    new_clients_period = (
        await db.execute(
            select(func.count(func.distinct(UserSession.user_id)))
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.session_kind == "register",
                UserSession.created_at >= start_at,
                User.role == UserRole.CLIENT,
            )
        )
    ).scalar_one()

    # --- Активность: сообщения, отзывы ------------------------------------
    messages_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(MarketplaceMessage.kind == "offer"),
            ).where(MarketplaceMessage.created_at >= start_at)
        )
    ).one()
    messages_period, offers_period = messages_row

    reviews_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(MarketplaceReview.created_at >= start_at),
                func.avg(MarketplaceReview.rating),
            )
        )
    ).one()
    reviews_total, reviews_period, avg_rating = reviews_row

    # --- Обслуживание: тикеты, премиум, модерация -------------------------
    tickets_row = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(
                    SupportTicket.subject == SupportTicketSubject.DISPUTE.value
                ),
            ).where(SupportTicket.status == SupportTicketStatus.OPEN.value)
        )
    ).one()
    tickets_open, disputes_open = tickets_row

    premium_new = (
        await db.execute(
            select(func.count()).where(
                MarketplacePremiumRequest.status == PremiumRequestStatus.NEW.value
            )
        )
    ).scalar_one()

    moderation_pending = (
        await db.execute(
            select(func.count()).where(
                BloggerAudienceSubmission.status
                == AudienceSubmissionStatus.PENDING.value
            )
        )
    ).scalar_one()

    # --- Выводы средств ----------------------------------------------------
    withdrawals_row = (
        await db.execute(
            select(
                func.count().filter(
                    MarketplaceWithdrawal.status == WithdrawalStatus.PENDING.value
                ),
                func.coalesce(
                    func.sum(MarketplaceWithdrawal.amount_kopeks).filter(
                        MarketplaceWithdrawal.status == WithdrawalStatus.PENDING.value
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(MarketplaceWithdrawal.amount_kopeks).filter(
                        MarketplaceWithdrawal.status == WithdrawalStatus.COMPLETED.value
                    ),
                    0,
                ),
            )
        )
    ).one()
    wd_pending_count, wd_pending_sum, wd_completed_sum = withdrawals_row

    # --- Дневные ряды ------------------------------------------------------
    orders_daily = await _count_series(db, order.created_at, start_at, start_date, days)

    paid_day = _day(paid_ts).label("day")
    gmv_rows = (
        await db.execute(
            paid_join(
                select(paid_day, func.count(), func.coalesce(func.sum(order.amount_kopeks), 0))
            )
            .where(paid_ts >= start_at)
            .group_by(paid_day)
        )
    ).all()
    gmv_daily = _fill_money(
        {row[0].date().isoformat(): (row[1], int(row[2])) for row in gmv_rows},
        start_date,
        days,
    )
    completed_daily = await _money_series(
        db, order.completed_at, order.amount_kopeks, start_at, start_date, days
    )
    platform_income_daily = await _money_series(
        db,
        MarketplaceEscrowEntry.created_at,
        MarketplaceEscrowEntry.amount_kopeks,
        start_at,
        start_date,
        days,
        MarketplaceEscrowEntry.entry_type == "release_platform",
    )
    messages_daily = await _count_series(
        db, MarketplaceMessage.created_at, start_at, start_date, days
    )
    reviews_daily = await _count_series(
        db, MarketplaceReview.created_at, start_at, start_date, days
    )

    # Новые пользователи: заказчики из register-сессий, авторы из профилей
    clients_day = _day(UserSession.created_at).label("day")
    clients_rows = (
        await db.execute(
            select(clients_day, func.count(func.distinct(UserSession.user_id)))
            .join(User, User.id == UserSession.user_id)
            .where(
                UserSession.session_kind == "register",
                UserSession.created_at >= start_at,
                User.role == UserRole.CLIENT,
            )
            .group_by(clients_day)
        )
    ).all()
    bloggers_day = _day(BloggerProfile.created_at).label("day")
    bloggers_rows = (
        await db.execute(
            select(bloggers_day, func.count())
            .where(BloggerProfile.created_at >= start_at)
            .group_by(bloggers_day)
        )
    ).all()
    clients_by_day = {row[0].date().isoformat(): row[1] for row in clients_rows}
    bloggers_by_day = {row[0].date().isoformat(): row[1] for row in bloggers_rows}
    new_users_daily = [
        DailyNewUsersPoint(
            date=iso,
            clients=clients_by_day.get(iso, 0),
            bloggers=bloggers_by_day.get(iso, 0),
        )
        for iso in (
            (start_date + timedelta(days=i)).isoformat() for i in range(days)
        )
    ]

    # --- Распределение по статусам (за всё время) --------------------------
    status_rows = (
        await db.execute(
            select(
                order.status,
                func.count(),
                func.coalesce(func.sum(order.amount_kopeks), 0),
            ).group_by(order.status)
        )
    ).all()
    status_distribution = [
        StatusSlice(status=row[0], count=row[1], amount_kopeks=int(row[2]))
        for row in status_rows
    ]

    # --- Воронка по когорте заказов, созданных за период -------------------
    funnel_row = (
        await db.execute(
            paid_join(
                select(
                    func.count(),
                    func.count().filter(
                        (order.accepted_at.is_not(None)) | (paid_ts.is_not(None))
                    ),
                    func.count().filter(paid_ts.is_not(None)),
                    func.count().filter(
                        (order.work_submitted_at.is_not(None))
                        | (order.completed_at.is_not(None))
                    ),
                    func.count().filter(order.completed_at.is_not(None)),
                )
            ).where(order.created_at >= start_at)
        )
    ).one()
    funnel = [
        FunnelStage(key=key, count=count)
        for key, count in zip(
            ["created", "accepted", "paid", "submitted", "completed"], funnel_row
        )
    ]
    conversion_paid_pct = (
        round(funnel_row[2] / funnel_row[0] * 100, 1) if funnel_row[0] else 0.0
    )

    # --- Гистограмма оценок (за всё время) ---------------------------------
    rating_rows = (
        await db.execute(
            select(MarketplaceReview.rating, func.count()).group_by(
                MarketplaceReview.rating
            )
        )
    ).all()
    ratings_map = {row[0]: row[1] for row in rating_rows}
    ratings = [
        RatingBucket(rating=value, count=ratings_map.get(value, 0))
        for value in range(1, 6)
    ]

    # --- Гистограмма чеков оплаченных заказов за период --------------------
    amounts = (
        (
            await db.execute(
                paid_join(select(order.amount_kopeks)).where(paid_ts >= start_at)
            )
        )
        .scalars()
        .all()
    )
    bucket_counts = [0] * len(_AMOUNT_BUCKETS)
    for amount in amounts:
        for index, (upper, _label) in enumerate(_AMOUNT_BUCKETS):
            if upper is None or amount < upper:
                bucket_counts[index] += 1
                break
    amounts_histogram = [
        AmountBucket(label=label, count=bucket_counts[index])
        for index, (_upper, label) in enumerate(_AMOUNT_BUCKETS)
    ]

    # --- Топ авторов и заказчиков по оплатам за период ---------------------
    top_bloggers_rows = (
        await db.execute(
            paid_join(
                select(
                    order.blogger_id,
                    User.name,
                    func.count(),
                    func.coalesce(func.sum(order.amount_kopeks), 0),
                    func.count().filter(order.completed_at.is_not(None)),
                    BloggerProfile.rating,
                )
            )
            .join(User, User.id == order.blogger_id)
            .outerjoin(BloggerProfile, BloggerProfile.user_id == order.blogger_id)
            .where(paid_ts >= start_at)
            .group_by(order.blogger_id, User.name, BloggerProfile.rating)
            .order_by(func.sum(order.amount_kopeks).desc())
            .limit(10)
        )
    ).all()
    top_bloggers = [
        TopBloggerItem(
            user_id=row[0],
            name=row[1],
            orders=row[2],
            turnover_kopeks=int(row[3]),
            completed=row[4],
            rating=float(row[5]) if row[5] is not None else None,
        )
        for row in top_bloggers_rows
    ]

    top_clients_rows = (
        await db.execute(
            paid_join(
                select(
                    order.client_id,
                    User.name,
                    func.count(),
                    func.coalesce(func.sum(order.amount_kopeks), 0),
                )
            )
            .join(User, User.id == order.client_id)
            .where(paid_ts >= start_at)
            .group_by(order.client_id, User.name)
            .order_by(func.sum(order.amount_kopeks).desc())
            .limit(10)
        )
    ).all()
    top_clients = [
        TopClientItem(
            user_id=row[0], name=row[1], orders=row[2], spend_kopeks=int(row[3])
        )
        for row in top_clients_rows
    ]

    # --- Услуги: заказы за период + оплаченный оборот ----------------------
    service_name = func.coalesce(order.service_type_name, "Без услуги").label("name")
    service_rows = (
        await db.execute(
            paid_join(
                select(
                    service_name,
                    func.count(),
                    func.coalesce(
                        func.sum(order.amount_kopeks).filter(paid_ts.is_not(None)), 0
                    ),
                )
            )
            .where(order.created_at >= start_at)
            .group_by(service_name)
            .order_by(func.count().desc())
            .limit(12)
        )
    ).all()
    service_types = [
        ServiceTypeSlice(name=row[0], orders=row[1], turnover_kopeks=int(row[2]))
        for row in service_rows
    ]

    # --- Теплокарта сообщений: день недели × час (МСК) ---------------------
    local_ts = func.timezone("UTC", MarketplaceMessage.created_at) + timedelta(hours=3)
    heatmap_rows = (
        await db.execute(
            select(
                func.extract("isodow", local_ts),
                func.extract("hour", local_ts),
                func.count(),
            )
            .where(MarketplaceMessage.created_at >= start_at)
            .group_by(func.extract("isodow", local_ts), func.extract("hour", local_ts))
        )
    ).all()
    activity_heatmap = [[0] * 24 for _ in range(7)]
    for row in heatmap_rows:
        activity_heatmap[int(row[0]) - 1][int(row[1])] = row[2]

    summary = MarketplaceStatsSummary(
        gmv_total_kopeks=int(gmv_total),
        gmv_period_kopeks=int(gmv_period),
        platform_income_total_kopeks=int(platform_income_total),
        platform_income_period_kopeks=int(platform_income_period),
        escrow_now_kopeks=int(escrow_now),
        balances_owed_kopeks=int(balances_owed),
        refunded_period_kopeks=int(refunded_period_sum),
        refunded_period_count=refunded_period_count,
        avg_check_period_kopeks=int(avg_check),
        orders_total=orders_total,
        orders_period=orders_period,
        paid_period=paid_period,
        completed_total=completed_total,
        completed_period=completed_period,
        conversion_paid_pct=conversion_paid_pct,
        avg_accept_hours=(
            round(float(avg_accept_sec) / 3600, 1) if avg_accept_sec is not None else None
        ),
        avg_completion_hours=(
            round(float(avg_completion_sec) / 3600, 1)
            if avg_completion_sec is not None
            else None
        ),
        clients_total=clients_total,
        new_clients_period=new_clients_period,
        buyers_period=buyers_period,
        repeat_buyers_period=repeat_buyers,
        bloggers_total=bloggers_total,
        active_bloggers=active_bloggers,
        new_bloggers_period=new_bloggers_period,
        messages_period=messages_period,
        offers_period=offers_period,
        reviews_total=reviews_total,
        reviews_period=reviews_period,
        avg_rating=round(float(avg_rating), 2) if avg_rating is not None else None,
        tickets_open=tickets_open,
        disputes_open=disputes_open,
        premium_new=premium_new,
        moderation_pending=moderation_pending,
        withdrawals_pending_count=wd_pending_count,
        withdrawals_pending_kopeks=int(wd_pending_sum),
        withdrawals_completed_kopeks=int(wd_completed_sum),
    )

    return MarketplaceStatsResponse(
        range_days=days,
        generated_at=now,
        summary=summary,
        orders_daily=orders_daily,
        gmv_daily=gmv_daily,
        completed_daily=completed_daily,
        platform_income_daily=platform_income_daily,
        new_users_daily=new_users_daily,
        messages_daily=messages_daily,
        reviews_daily=reviews_daily,
        status_distribution=status_distribution,
        funnel=funnel,
        ratings=ratings,
        amounts_histogram=amounts_histogram,
        top_bloggers=top_bloggers,
        top_clients=top_clients,
        service_types=service_types,
        activity_heatmap=activity_heatmap,
    )
