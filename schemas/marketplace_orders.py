from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from enums.marketplace import MarketplaceOrderStatus


class OrderCreateRequest(BaseModel):
    """Запрос на создание заказа на маркетплейсе."""

    blogger_id: uuid.UUID
    message: Annotated[str, Field(min_length=1, max_length=1000)]


class OrderResponse(BaseModel):
    """Ответ с данными заказа."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    client_id: uuid.UUID
    blogger_id: uuid.UUID
    worker_id: uuid.UUID | None = None
    status: MarketplaceOrderStatus
    amount_kopeks: int
    message: str
    platform_commission_pct: float
    worker_commission_pct: float
    yookassa_payment_id: str | None = None
    payment_url: str | None = None
    payment_expires_at: datetime | None = None
    created_at: datetime
    paid_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime


class OrderListResponse(BaseModel):
    """Список заказов с пагинацией."""

    items: list[OrderResponse]
    total: int
    page: int
    page_size: int
