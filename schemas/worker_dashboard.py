from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ReferralInfo(BaseModel):
    """Информация о приведённом заказчике (реферале воркера)."""

    model_config = {"from_attributes": True}

    client_id: uuid.UUID
    client_name: str
    registered_at: datetime


class ReferralListResponse(BaseModel):
    """Список рефералов воркера с пагинацией."""

    items: list[ReferralInfo]
    total: int
    page: int
    page_size: int


class CommissionEntry(BaseModel):
    """Запись о начислении комиссии воркеру."""

    model_config = {"from_attributes": True}

    order_id: uuid.UUID
    client_name: str
    order_amount_kopeks: int
    commission_pct: float
    commission_amount_kopeks: int
    date: datetime


class CommissionListResponse(BaseModel):
    """Список начислений комиссий с пагинацией."""

    items: list[CommissionEntry]
    total: int
    page: int
    page_size: int


class WorkerMarketplaceStats(BaseModel):
    """Сводная статистика воркера на маркетплейсе."""

    total_earnings_kopeks: int
    balance_kopeks: int
    referral_count: int


class ReferralLinkResponse(BaseModel):
    """Реферальная ссылка воркера для привлечения заказчиков."""

    referral_url: str
