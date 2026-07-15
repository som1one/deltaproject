from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from enums.marketplace import BloggerCategory, MarketplaceOrderStatus


class DashboardResponse(BaseModel):
    """Сводка маркетплейса для админ-панели."""

    total_orders: int
    total_revenue_kopeks: int  # сумма заказов в статусах ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED
    active_bloggers_count: int
    registered_clients_count: int


class AdminOrderResponse(BaseModel):
    """Ответ с данными заказа для админ-панели, включая имена участников."""

    id: uuid.UUID
    client_id: uuid.UUID
    blogger_id: uuid.UUID
    worker_id: uuid.UUID | None = None
    amount_kopeks: int
    status: MarketplaceOrderStatus
    created_at: datetime
    updated_at: datetime
    payment_reported_at: datetime | None = None
    client_name: str = ""
    blogger_name: str = ""
    worker_name: str | None = None


class AdminOrderListResponse(BaseModel):
    """Список заказов с пагинацией для админ-панели."""

    items: list[AdminOrderResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Order Detail (admin) — полная информация включая историю и ledger
# ---------------------------------------------------------------------------


class StatusHistoryEntry(BaseModel):
    """Запись из истории смены статусов заказа."""

    id: uuid.UUID
    old_status: str | None
    new_status: str
    changed_by: uuid.UUID
    reason: str | None = None
    created_at: datetime


class EscrowLedgerEntry(BaseModel):
    """Запись из журнала эскроу-операций по заказу."""

    id: uuid.UUID
    user_id: uuid.UUID
    entry_type: str
    amount_kopeks: int
    note: str | None = None
    created_at: datetime


class DistributionBreakdown(BaseModel):
    """Разбивка распределения средств по заказу."""

    blogger_share: int
    worker_share: int
    platform_share: int


class AdminOrderDetailResponse(BaseModel):
    """Полная информация о заказе для админ-панели."""

    id: uuid.UUID
    client_id: uuid.UUID
    blogger_id: uuid.UUID
    worker_id: uuid.UUID | None = None
    amount_kopeks: int
    status: MarketplaceOrderStatus
    message: str
    platform_commission_pct: Decimal
    worker_commission_pct: Decimal
    created_at: datetime
    updated_at: datetime
    paid_at: datetime | None = None
    completed_at: datetime | None = None
    blogger_confirmed_at: datetime | None = None
    refunded_at: datetime | None = None
    refund_reason: str | None = None
    # Participant names
    client_name: str = ""
    blogger_name: str = ""
    worker_name: str | None = None
    # History, ledger, distribution
    status_history: list[StatusHistoryEntry] = []
    ledger_entries: list[EscrowLedgerEntry] = []
    distribution: DistributionBreakdown | None = None


# ---------------------------------------------------------------------------
# Summary (admin) — сводка по заказам маркетплейса
# ---------------------------------------------------------------------------


class OrderCountByStatus(BaseModel):
    """Количество заказов по одному статусу."""

    status: MarketplaceOrderStatus
    count: int


class AdminMarketplaceSummaryResponse(BaseModel):
    """Сводка по заказам маркетплейса для админ-панели.

    - total_turnover_kopeks: общий оборот (заказы в ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED)
    - orders_by_status: количество заказов по каждому статусу
    - total_worker_commissions_kopeks: сумма всех выплат воркерам (release_worker entries)
    """

    total_turnover_kopeks: int
    orders_by_status: list[OrderCountByStatus]
    total_worker_commissions_kopeks: int


# ---------------------------------------------------------------------------
# Commission Settings
# ---------------------------------------------------------------------------


class CommissionSettingsResponse(BaseModel):
    """Текущие настройки комиссий маркетплейса."""

    platform_commission_pct: Decimal
    worker_referral_commission_pct: Decimal


class CommissionSettingsRequest(BaseModel):
    """Запрос на обновление настроек комиссий."""

    platform_commission_pct: Annotated[
        Decimal,
        Field(ge=1, le=50, description="Комиссия платформы, 1-50%"),
    ]
    worker_referral_commission_pct: Annotated[
        Decimal,
        Field(ge=1, le=30, description="Реферальная комиссия воркера, 1-30%"),
    ]

    @field_validator("platform_commission_pct")
    @classmethod
    def validate_platform_commission_precision(cls, v: Decimal) -> Decimal:
        """Максимум 2 знака после запятой."""
        if v.as_tuple().exponent is not None and abs(int(v.as_tuple().exponent)) > 2:
            raise ValueError("Максимум 2 знака после запятой для комиссии платформы")
        return v

    @field_validator("worker_referral_commission_pct")
    @classmethod
    def validate_worker_commission_precision(cls, v: Decimal) -> Decimal:
        """Максимум 2 знака после запятой."""
        if v.as_tuple().exponent is not None and abs(int(v.as_tuple().exponent)) > 2:
            raise ValueError("Максимум 2 знака после запятой для реферальной комиссии")
        return v


class OrderResolveRequest(BaseModel):
    """Запрос на разрешение спора по заказу (админ)."""

    decision: Literal["favor_client", "favor_blogger"]
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class TicketResolveRequest(BaseModel):
    """Закрытие тикета поддержки (админ).

    decision обязателен только для спора по активной сделке — он двигает деньги
    эскроу. Обычный вопрос (payment/technical/general или спор по уже закрытой
    сделке) закрывается без вердикта, только с комментарием.
    """

    decision: Literal["favor_client", "favor_blogger"] | None = None
    reason: Annotated[str, Field(min_length=1, max_length=1000)]


class AdminTicketItem(BaseModel):
    """Тикет в админ-списке: тема, автор обращения и привязанная сделка."""

    id: uuid.UUID
    subject: str
    message: str
    status: str
    created_at: datetime
    submitter_id: uuid.UUID
    submitter_name: str
    submitter_role: str
    order_id: uuid.UUID | None = None
    order_status: str | None = None
    order_amount_kopeks: int | None = None


class AdminTicketListResponse(BaseModel):
    """Список тикетов для админ-панели с пагинацией."""

    items: list[AdminTicketItem]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Hero (витрина лендинга)
# ---------------------------------------------------------------------------


class HeroConfigAdminResponse(BaseModel):
    """Сырая настройка витрины для админки (ниши + user_id авторов)."""

    featured_categories: list[str] = Field(default_factory=list)
    featured_all: list[uuid.UUID] = Field(default_factory=list)
    featured_by_category: dict[str, list[uuid.UUID]] = Field(default_factory=dict)


class HeroConfigUpdateRequest(BaseModel):
    """Сохранение витрины: до 3 ниш и списки авторов (для «все» и по нишам)."""

    featured_categories: list[str] = Field(default_factory=list)
    featured_all: Annotated[list[uuid.UUID], Field(max_length=24)] = Field(default_factory=list)
    featured_by_category: dict[str, list[uuid.UUID]] = Field(default_factory=dict)

    @field_validator("featured_categories")
    @classmethod
    def _clean_categories(cls, value: list[str]) -> list[str]:
        valid = {category.value for category in BloggerCategory}
        seen: set[str] = set()
        cleaned: list[str] = []
        for item in value:
            if item in valid and item not in seen:
                seen.add(item)
                cleaned.append(item)
        return cleaned[:3]

    @field_validator("featured_by_category")
    @classmethod
    def _clean_by_category(
        cls, value: dict[str, list[uuid.UUID]]
    ) -> dict[str, list[uuid.UUID]]:
        valid = {category.value for category in BloggerCategory}
        return {key: ids[:24] for key, ids in value.items() if key in valid}
