import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, EmailStr, Field, model_validator

from enums.user import UserRole
from schemas.deal import DealRead


class UserMeRead(BaseModel):
    """Профиль для GET /me и ответа PATCH /me (без секретов)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    email: str
    telegram: str | None
    role: UserRole
    linked_to: uuid.UUID | None
    percent: float
    balance: int
    balance_pending_confirmation_kopeks: int = 0


class UserMePatch(BaseModel):
    name: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    telegram: Annotated[str | None, Field(None, max_length=255)] = None
    email: EmailStr | None = None
    password: Annotated[str | None, Field(None, min_length=8, max_length=100)] = None
    current_password: str | None = Field(
        default=None,
        description="Обязателен при смене password",
    )

    @model_validator(mode="after")
    def validate_patch(self) -> UserMePatch:
        if self.password is not None and not self.current_password:
            raise ValueError("При смене пароля укажите current_password")
        if (
            self.name is None
            and self.telegram is None
            and self.email is None
            and self.password is None
        ):
            raise ValueError("Укажите хотя бы одно поле для обновления")
        return self


class WorkerMeStatsRead(BaseModel):
    model_config = {"from_attributes": True}

    role: Literal[UserRole.WORKER] = UserRole.WORKER
    deals: int
    agree: int
    paid: int
    earn: int


class BloggerMeStatsRead(BaseModel):
    model_config = {"from_attributes": True}

    role: Literal[UserRole.BLOGER] = UserRole.BLOGER
    deals: int
    earn: int
    workers: int


MeStatsResponse = Union[WorkerMeStatsRead, BloggerMeStatsRead]


class MeDealsResponse(BaseModel):
    deals: list[DealRead]
