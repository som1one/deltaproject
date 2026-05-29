import uuid
from typing import Annotated

from pydantic import BaseModel, Field

from enums.user import UserRole


class RegisterRequest(BaseModel):
    """Внутренняя схема для создания пользователя через сервис.

    Email используется как технический ключ (для Telegram-воркеров —
    ``tg_<id>@telegram.example.com``). В публичных эндпоинтах не нужна.
    """

    name: str
    email: str
    telegram: str | None = None
    password: Annotated[str, Field(min_length=8, max_length=100)]
    role: UserRole
    linked_to: uuid.UUID | None = Field(
        default=None,
        description="UUID блогера с реф-ссылки; фронт подставляет после маршрута /ref/...",
    )


class BloggerLoginRequest(BaseModel):
    nickname: Annotated[
        str,
        Field(
            min_length=3,
            max_length=32,
            pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,30}[A-Za-z0-9])$",
        ),
    ]
    password: str


class AdminLoginRequest(BaseModel):
    """Email + пароль — единственный сценарий, где остаётся «классический» логин."""

    email: Annotated[str, Field(min_length=3, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=200)]


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramOAuthConfigResponse(BaseModel):
    enabled: bool
    bot_username: str | None = None


class AuthTokensResponse(BaseModel):
    message: str
    token: str
    refresh_token: str


class TelegramAuthExchangeRequest(BaseModel):
    """Одноразовый ticket из URL фронта (?exchange=...)."""

    ticket: Annotated[str, Field(min_length=10, max_length=128)]
