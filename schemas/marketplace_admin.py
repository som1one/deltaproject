from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator


class DashboardResponse(BaseModel):
    """Сводка маркетплейса для админ-панели."""

    total_orders: int
    total_revenue_kopeks: int  # сумма заказов в статусах ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED
    active_bloggers_count: int
    registered_clients_count: int


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
