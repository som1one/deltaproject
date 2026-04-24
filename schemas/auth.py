import uuid
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field

from enums.user import UserRole


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    telegram: str | None = None
    password: Annotated[str, Field(min_length=8, max_length=100)]
    role: UserRole
    linked_to: uuid.UUID | None = Field(
        default=None,
        description="UUID блогера с реф-ссылки; фронт подставляет после маршрута /ref/...",
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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


class RefreshRequest(BaseModel):
    refresh_token: str


class TelegramOAuthConfigResponse(BaseModel):
    enabled: bool
    client_id: str | None = None


class AuthTokensResponse(BaseModel):
    message: str
    token: str
    refresh_token: str


class TelegramOAuthTokenRequest(BaseModel):
    id_token: Annotated[str, Field(min_length=1)]


class TelegramOAuthCodeExchangeRequest(BaseModel):
    code: Annotated[str, Field(min_length=1)]
    redirect_uri: Annotated[str, Field(min_length=1)]
    code_verifier: Annotated[str, Field(min_length=43, max_length=128)]


class TelegramOAuthCodeExchangeResponse(BaseModel):
    id_token: str


class TelegramOAuthVerifyRequest(TelegramOAuthTokenRequest):
    pass


class TelegramOAuthVerifyResponse(BaseModel):
    telegram_id: int
    first_name: str
    last_name: str | None = None
    username: str
    telegram: str | None = None


class TelegramWorkerLoginRequest(TelegramOAuthTokenRequest):
    pass


class TelegramWorkerRegisterRequest(TelegramOAuthTokenRequest):
    name: Annotated[str, Field(min_length=2, max_length=255)]
    linked_to: uuid.UUID | None = Field(
        default=None,
        description="UUID блогера с реф-ссылки; заполняется только для нового воркера",
    )
