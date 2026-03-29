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


class RefreshRequest(BaseModel):
    refresh_token: str
