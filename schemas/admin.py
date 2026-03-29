import uuid
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field

from enums.user import UserRole
from schemas.ledger import LedgerListResponse


class AdminUserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    email: str
    telegram: str | None
    role: UserRole
    linked_to: uuid.UUID | None
    percent: float
    balance: int
    is_active: bool


class AdminUserPatch(BaseModel):
    role: UserRole | None = None
    percent: Annotated[float | None, Field(ge=0)] = None
    is_active: bool | None = None
    email: EmailStr | None = None
    telegram: Annotated[str | None, Field(None, max_length=255)] = None
    name: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserRead]
    total: int


class AdminUserLedgerResponse(LedgerListResponse):
    pass
