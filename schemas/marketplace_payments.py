from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class PaymentCreateResponse(BaseModel):
    """Ответ при создании платежа через YooKassa."""

    order_id: uuid.UUID
    payment_id: str
    payment_url: str
    expires_at: datetime


class PaymentStatusResponse(BaseModel):
    """Статус платежа по заказу."""

    order_id: uuid.UUID
    payment_id: str | None = None
    status: str  # "pending", "succeeded", "canceled"
    paid: bool
    amount_kopeks: int
