"""Схемы большой статистики маркетплейса для админ-панели.

Все деньги — в копейках, все дневные ряды — zero-filled по дням МСК
(Москва — фиксированный UTC+3), поэтому фронтенд только рисует.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class DailyCountPoint(BaseModel):
    """Точка дневного ряда: количество событий за день."""

    date: str  # ISO-дата дня (МСК)
    count: int


class DailyMoneyPoint(BaseModel):
    """Точка дневного ряда: количество и сумма за день."""

    date: str
    count: int
    amount_kopeks: int


class DailyNewUsersPoint(BaseModel):
    """Новые пользователи за день: заказчики и авторы раздельно."""

    date: str
    clients: int
    bloggers: int


class StatusSlice(BaseModel):
    """Срез заказов по статусу (за всё время)."""

    status: str
    count: int
    amount_kopeks: int


class FunnelStage(BaseModel):
    """Ступень воронки по когорте заказов, созданных за период."""

    key: str  # created | accepted | paid | submitted | completed
    count: int


class RatingBucket(BaseModel):
    """Количество отзывов с данной оценкой (за всё время)."""

    rating: int  # 1..5
    count: int


class AmountBucket(BaseModel):
    """Корзина гистограммы чеков оплаченных заказов за период."""

    label: str  # например «1–3 тыс»
    count: int


class TopBloggerItem(BaseModel):
    """Автор в топе по обороту оплаченных заказов за период."""

    user_id: uuid.UUID
    name: str
    orders: int
    turnover_kopeks: int
    completed: int
    rating: float | None = None


class TopClientItem(BaseModel):
    """Заказчик в топе по сумме оплат за период."""

    user_id: uuid.UUID
    name: str
    orders: int
    spend_kopeks: int


class ServiceTypeSlice(BaseModel):
    """Популярность услуги: заказы за период и оплаченный оборот."""

    name: str
    orders: int
    turnover_kopeks: int


class MarketplaceStatsSummary(BaseModel):
    """KPI-сводка. «Период» — выбранный диапазон дней, остальное — за всё время."""

    # Деньги
    gmv_total_kopeks: int
    gmv_period_kopeks: int
    platform_income_total_kopeks: int
    platform_income_period_kopeks: int
    escrow_now_kopeks: int
    balances_owed_kopeks: int
    refunded_period_kopeks: int
    refunded_period_count: int
    avg_check_period_kopeks: int
    # Заказы
    orders_total: int
    orders_period: int
    paid_period: int
    completed_total: int
    completed_period: int
    conversion_paid_pct: float
    avg_accept_hours: float | None = None
    avg_completion_hours: float | None = None
    # Люди
    clients_total: int
    new_clients_period: int
    buyers_period: int
    repeat_buyers_period: int
    bloggers_total: int
    active_bloggers: int
    new_bloggers_period: int
    # Активность
    messages_period: int
    offers_period: int
    reviews_total: int
    reviews_period: int
    avg_rating: float | None = None
    # Обслуживание
    tickets_open: int
    disputes_open: int
    premium_new: int
    moderation_pending: int
    # Выводы средств
    withdrawals_pending_count: int
    withdrawals_pending_kopeks: int
    withdrawals_completed_kopeks: int


class MarketplaceStatsResponse(BaseModel):
    """Полный ответ раздела «Статистика маркетплейса»."""

    range_days: int
    generated_at: datetime
    summary: MarketplaceStatsSummary
    # Дневные ряды (zero-filled, МСК)
    orders_daily: list[DailyCountPoint]
    gmv_daily: list[DailyMoneyPoint]
    completed_daily: list[DailyMoneyPoint]
    platform_income_daily: list[DailyMoneyPoint]
    new_users_daily: list[DailyNewUsersPoint]
    messages_daily: list[DailyCountPoint]
    reviews_daily: list[DailyCountPoint]
    # Распределения и топы
    status_distribution: list[StatusSlice]
    funnel: list[FunnelStage]
    ratings: list[RatingBucket]
    amounts_histogram: list[AmountBucket]
    top_bloggers: list[TopBloggerItem]
    top_clients: list[TopClientItem]
    service_types: list[ServiceTypeSlice]
    # Теплокарта сообщений: 7 строк (Пн..Вс) × 24 часа (МСК)
    activity_heatmap: list[list[int]]
