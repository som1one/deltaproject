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


class LedgerListResponse(BaseModel):
    items: list[LedgerEntryRead]
    total: int


class PayoutRequestCreate(BaseModel):
    amount_kopeks: Annotated[int, Field(gt=0, description="Сумма выплаты в копейках")]


class AdminLedgerStatusPatch(BaseModel):
    status: LedgerEntryStatus
    note: Annotated[str | None, Field(None, max_length=4000)] = None
