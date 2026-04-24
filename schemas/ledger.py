import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from enums.ledger import LedgerEntryStatus


class LedgerEntryRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    deal_id: uuid.UUID | None
    amount_kopeks: int
    status: LedgerEntryStatus
    created_at: datetime
    updated_at: datetime
    idempotency_key: str | None
    note: str | None
    yookassa_payout_id: str | None = None


class LedgerListResponse(BaseModel):
    items: list[LedgerEntryRead]
    total: int


class PayoutRequestCreate(BaseModel):
    amount_kopeks: Annotated[int, Field(gt=0, description="Сумма выплаты в копейках")]
    payout_token: Annotated[
        str | None,
        Field(None, description="Токен карты из виджета ЮKassa (обязателен при включённых выплатах)"),
    ] = None


class PayoutWidgetConfigResponse(BaseModel):
    """Публичные параметры для инициализации виджета сбора карты."""

    enabled: bool = Field(description="Показывать виджет и требовать payout_token")
    gateway_id: str | None = Field(None, description="account_id для PayoutsData (шлюз)")


class AdminLedgerStatusPatch(BaseModel):
    status: LedgerEntryStatus
    note: Annotated[str | None, Field(None, max_length=4000)] = None
