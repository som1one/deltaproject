from __future__ import annotations

import enum
import uuid
from datetime import date
from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class FinancePreviewResponse(BaseModel):
    """Распределение суммы по схеме блогера (калькулятор в админке)."""

    bloger_id: uuid.UUID
    price_kopeks: int = Field(description="База расчёта, копейки")
    worker_kopeks: int
    bloger_kopeks: int
    upline_kopeks: int
    platform_kopeks: int
    weight_worker: int
    weight_bloger: int
    weight_upline: int
    weight_platform: int


class FinanceSchemeAdminRead(BaseModel):
    """Схема распределения для блогера (из БД или значения по умолчанию)."""

    blogger_id: uuid.UUID
    blogger_name: str
    blogger_email: str
    scheme_id: uuid.UUID | None = Field(description="null — в БД ещё нет строки, показаны дефолтные веса")
    weight_worker: int
    weight_bloger: int
    weight_upline: int
    weight_platform: int


class FinanceSchemeAdminPut(BaseModel):
    weight_worker: Annotated[int, Field(ge=0)]
    weight_bloger: Annotated[int, Field(ge=0)]
    weight_upline: Annotated[int, Field(ge=0)]
    weight_platform: Annotated[int, Field(ge=0)]

    @model_validator(mode="after")
    def weights_sum_positive(self) -> FinanceSchemeAdminPut:
        s = self.weight_worker + self.weight_bloger + self.weight_upline + self.weight_platform
        if s <= 0:
            raise ValueError("Сумма весов должна быть больше нуля")
        return self


class FinanceSchemeAdminListResponse(BaseModel):
    items: list[FinanceSchemeAdminRead]
    total: int


class ReportingPeriod(str, enum.Enum):
    """Период агрегации показателей финансового дашборда."""

    TODAY = "today"
    WEEK = "week"
    MONTH = "month"
    ALL = "all"


class TopParticipant(BaseModel):
    """Элемент списка топ-участников (блогеры/воркеры)."""

    user_id: uuid.UUID
    earnings_kopeks: int
    paid_deals_count: int
    name: str = ""  # имя из профиля; пустое, если пользователь удалён
    nickname: str | None = None


class TimeSeriesPoint(BaseModel):
    """Точка дневной динамики оборота и доли платформы.

    Две базы отсчёта, не путать: `turnover_kopeks`/`deals_created`/
    `paid_deals_count` — когорта по дате создания сделки, а
    `turnover_paid_kopeks`/`payments_count`/`accrued_platform_share_kopeks` —
    по дате распределения долей, то есть реально прошедшие в этот день деньги.
    """

    date: date  # день (UTC)
    turnover_kopeks: int  # оборот сделок, созданных в этот день
    accrued_platform_share_kopeks: int  # доля платформы, начисленная в этот день
    deals_created: int = 0  # создано сделок за день (любой статус)
    paid_deals_count: int = 0  # из них дошли до PAID/COMPLETED
    turnover_paid_kopeks: int = 0  # сумма сделок, распределённых в этот день
    payments_count: int = 0  # сколько сделок распределено в этот день


class ReferralShareByBlogger(BaseModel):
    """Реферальная доля, начисленная конкретному аплайн-блогеру."""

    upline_blogger_id: uuid.UUID
    amount_kopeks: int
    name: str = ""
    nickname: str | None = None


class FunnelStage(BaseModel):
    """Шаг воронки: сколько сделок когорты периода дошло до этого статуса."""

    key: str  # created / review / confirmed / escrow / paid / completed
    count: int


class AmountBucket(BaseModel):
    """Корзина гистограммы чеков оплаченных сделок."""

    label: str  # человекочитаемый диапазон, например «5–10 тыс»
    count: int
    amount_kopeks: int


class PeriodComparison(BaseModel):
    """Те же показатели за предыдущий отрезок такой же длины (для дельт)."""

    turnover_kopeks: int  # когорта: сделки, созданные в том отрезке
    turnover_paid_kopeks: int  # деньги, распределённые в том отрезке
    platform_share_kopeks: int
    deals_created: int
    paid_deals_count: int


class ParticipantCounts(BaseModel):
    """Люди платформы: сколько всего и сколько реально работало за период."""

    workers_total: int
    bloggers_total: int
    clients_total: int
    active_workers: int  # воркеры с оплаченными сделками за период
    active_bloggers: int  # блогеры с оплаченными сделками за период
    banned_total: int


class PayoutQueue(BaseModel):
    """Очередь выплат по журналу (записи без привязки к сделке)."""

    pending_count: int  # payout_request + pending_confirmation + freeze
    pending_kopeks: int
    completed_count: int
    completed_kopeks: int
    rejected_count: int


class ActiveReferralLinks(BaseModel):
    """Счётчики активных реферальных связей."""

    bloggers_with_upline: int  # блогеры с непустым upline_blogger_id
    workers_with_link: int  # воркеры с непустым linked_to


class PlatformFinanceDashboard(BaseModel):
    """Сводка финансовых показателей платформы. Все суммы — целые копейки."""

    period: ReportingPeriod  # применённый период (эхо запроса)

    # Базовые показатели
    platform_balance_kopeks: int
    net_profit_kopeks: int
    earnings_by_role_kopeks: dict[str, int]  # {"Worker","Bloger","Platform"}
    total_completed_payouts_kopeks: int

    # A. Оборот и сделки
    turnover_total_kopeks: int
    turnover_by_status_kopeks: dict[str, int]  # ключи: NEW/REVIEW/CONFIRMED/PAID/COMPLETED/REJECTED
    deal_counts_by_status: dict[str, int]  # те же ключи
    average_order_value_kopeks: int  # 0, если нет оплаченных
    average_platform_commission_kopeks: int  # 0, если нет оплаченных

    # B. Обязательства
    platform_liabilities_kopeks: int
    net_free_funds_kopeks: int  # может быть отрицательным

    # C. Разбивка доли платформы
    accrued_platform_share_kopeks: int
    platform_withdrawn_kopeks: int
    platform_pending_funds_kopeks: int
    available_for_payout_kopeks: int  # может быть отрицательным

    # D. Динамика
    time_series: list[TimeSeriesPoint]  # упорядочен по date ASC

    # E. Топ-участники
    top_bloggers: list[TopParticipant]  # ≤ 10, по убыванию earnings
    top_workers: list[TopParticipant]  # ≤ 10, по убыванию earnings

    # F. Ожидаемые начисления
    expected_accruals_total_kopeks: int
    expected_future_shares_kopeks: dict[str, int]  # {"worker","bloger","upline","platform"}

    # G. Реферальная аналитика
    total_referral_share_to_uplines_kopeks: int
    referral_share_by_blogger: list[ReferralShareByBlogger]
    active_referral_links: ActiveReferralLinks

    # H. Расширенная аналитика периода
    # Всё в этой группе считается по выбранному периоду (в отличие от базовых
    # накопительных показателей выше), чтобы переключатель периода имел смысл.
    deals_created_period: int
    paid_deals_period: int
    # Деньги периода по дате распределения долей: с ними сходится
    # period_platform_share_kopeks, в отличие от когортного turnover_total_kopeks.
    turnover_paid_period_kopeks: int
    payments_period_count: int
    period_platform_share_kopeks: int  # доля платформы, начисленная в периоде
    earnings_by_role_period_kopeks: dict[str, int]  # {"Worker","Bloger","Upline","Platform"}
    previous_period: PeriodComparison | None  # None для периода `all`
    funnel: list[FunnelStage]  # когорта сделок, созданных в периоде
    take_rate_pct: float  # доля платформы от оборота оплаченных сделок
    conversion_to_paid_pct: float
    rejection_rate_pct: float
    refund_rate_pct: float
    avg_hours_to_payment: float | None  # от создания сделки до распределения долей
    avg_hours_to_first_contact: float | None  # от создания до контакта с клиентом
    median_order_value_kopeks: int
    max_order_value_kopeks: int
    amounts_histogram: list[AmountBucket]
    participants: ParticipantCounts
    payouts: PayoutQueue
    deals_heatmap: list[list[int]]  # 7×24 создание сделок, МСК; [пн..вс][0..23]
