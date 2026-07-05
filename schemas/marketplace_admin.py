from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from enums.marketplace import MarketplaceOrderStatus


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
