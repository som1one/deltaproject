import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

from enums.deal import DealStatus


class DealCreate(BaseModel):
    shop_link: Annotated[str, Field(min_length=1, max_length=2048)]
    item_name: Annotated[str, Field(min_length=1, max_length=512)]
    seller_tg: Annotated[str, Field(min_length=1, max_length=255)]
    seller_number: Annotated[str, Field(min_length=1, max_length=64)]
    price: Annotated[int, Field(gt=0)]
    bloger_id: uuid.UUID


class DealStatusPatch(BaseModel):
    """Только смена статуса сделки."""

    status: DealStatus


class AdminDealStatusPatch(BaseModel):
    status: DealStatus
    reason: Annotated[str, Field(min_length=1, max_length=4000)]


class AdminDealRecalcFinanceRequest(BaseModel):
    reason: Annotated[str, Field(min_length=1, max_length=4000)]


class DealRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    worker_id: uuid.UUID
    bloger_id: uuid.UUID
    shop_link: str
    item_name: str
    status: DealStatus
    price: int
    seller_tg: str
    seller_number: str
    created_at: datetime
