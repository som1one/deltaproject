from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field


class ClientRegisterRequest(BaseModel):
    """Запрос на регистрацию клиента на маркетплейсе."""

    name: Annotated[str, Field(min_length=1, max_length=255)]
    email: Annotated[EmailStr, Field(max_length=320)]
    password: Annotated[str, Field(min_length=8, max_length=100)]
    referral_code: str | None = Field(
        default=None,
        description="Реферальный код воркера (из URL)",
    )


class ClientLoginRequest(BaseModel):
    """Запрос на авторизацию клиента."""

    email: Annotated[str, Field(min_length=1, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=100)]


class ClientRefreshRequest(BaseModel):
    """Запрос на обновление токенов."""

    refresh_token: str


class TokenResponse(BaseModel):
    """Ответ с токенами авторизации."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: uuid.UUID
