from __future__ import annotations
import uuid
from typing import Annotated, Literal, Union

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from enums.user import UserRole
from schemas.deal import DealRead


class UserMeRead(BaseModel):
    """Профиль для GET /me и ответа PATCH /me (без секретов)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    email: str
    nickname: str | None
    telegram: str | None
    photo_url: str | None = None
    role: UserRole
    linked_to: uuid.UUID | None
    percent: float
    balance: int
    balance_pending_confirmation_kopeks: int = 0
    payout_card_last4: str | None = None
    payout_card_brand: str | None = None
    payout_card_holder: str | None = None
    payout_card_bank: str | None = None
    blogger_cabinet_locked: bool = False
    referral_invite_url: str | None = None


class CabinetUnlockBody(BaseModel):
    pin: Annotated[str, Field(min_length=1, max_length=64)]


class CabinetUnlockResponse(BaseModel):
    ok: bool = True
    unlock_token: str


class PayoutCardSet(BaseModel):
    """Номер карты только для вычисления отпечатка; PAN в БД не сохраняется."""

    card_number: Annotated[str, Field(min_length=12, max_length=32)]
    card_brand: str | None = None
    card_holder: str | None = None
    card_bank: str | None = None

class UserMePatch(BaseModel):
    name: Annotated[str | None, Field(None, min_length=1, max_length=255)] = None
    telegram: Annotated[str | None, Field(None, max_length=255)] = None
    email: EmailStr | None = None
    photo_url: Annotated[str | None, Field(None, max_length=2048)] = None
    password: Annotated[str | None, Field(None, min_length=8, max_length=100)] = None
    current_password: str | None = Field(
        default=None,
        description="Обязателен при смене password",
    )

    @field_validator("photo_url", mode="before")
    @classmethod
    def validate_photo_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        url = str(v).strip()
        if not url:
            return None
        if not url.startswith(("/uploads/", "http://", "https://")):
            raise ValueError("Некорректная ссылка на фото")
        return url

    @model_validator(mode="after")
    def validate_patch(self) -> UserMePatch:
        if self.password is not None and not self.current_password:
            raise ValueError("При смене пароля укажите current_password")
        if (
            self.name is None
            and self.telegram is None
            and self.email is None
            and self.photo_url is None
            and self.password is None
        ):
            raise ValueError("Укажите хотя бы одно поле для обновления")
        return self


class WorkerMeStatsRead(BaseModel):
    """Статистика кабинета работника (агрегаты по сделкам + накопленный заработок)."""

    model_config = {"from_attributes": True}

    role: Literal[UserRole.WORKER] = UserRole.WORKER
    deals: int = Field(description="Число созданных сделок (все статусы)")
    agree: int = Field(description="Сделок в статусе подтверждена и далее")
    paid: int = Field(description="Оплаченных сделок (PAID и COMPLETED)")
    earn: int = Field(description="Заработано работником, копейки (по завершённым сделкам)")


class BloggerMeStatsRead(BaseModel):
    model_config = {"from_attributes": True}

    role: Literal[UserRole.BLOGER] = UserRole.BLOGER
    deals: int
    earn: int
    workers: int


MeStatsResponse = Union[WorkerMeStatsRead, BloggerMeStatsRead]


class MeDealsResponse(BaseModel):
    deals: list[DealRead]
