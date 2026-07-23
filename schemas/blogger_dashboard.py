from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

# Запись о начислении переиспользуем из воркерского дашборда — форма идентична
# (order_id, client_name, order_amount_kopeks, commission_pct, commission_amount_kopeks, date).
from schemas.worker_dashboard import CommissionEntry, CommissionListResponse

__all__ = [
    "RecruitedWorkerInfo",
    "RecruitedWorkerListResponse",
    "BloggerMarketplaceStats",
    "CommissionEntry",
    "CommissionListResponse",
]


class RecruitedWorkerInfo(BaseModel):
    """Информация о воркере, приведённом блогером (2-й уровень)."""

    model_config = {"from_attributes": True}

    worker_id: uuid.UUID
    worker_name: str
    registered_at: datetime


class RecruitedWorkerListResponse(BaseModel):
    """Список приведённых воркеров с пагинацией."""

    items: list[RecruitedWorkerInfo]
    total: int
    page: int
    page_size: int


class BloggerMarketplaceStats(BaseModel):
    """Сводная статистика блогера по 2-му уровню рефералки."""

    total_earnings_kopeks: int
    balance_kopeks: int
    recruited_workers_count: int
    # Сколько с заказов этого блогера (как продавца) ушло на реферальные
    # комиссии (воркер + блогер-реферер) — для «нагоняющего» блока в кабинете.
    referral_outflow_kopeks: int
