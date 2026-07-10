from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator


class MessageSendRequest(BaseModel):
    """Запрос на отправку сообщения на маркетплейсе."""

    recipient_id: uuid.UUID
    text: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("text")
    @classmethod
    def validate_text_not_whitespace(cls, v: str) -> str:
        """Текст сообщения не должен состоять только из пробелов."""
        if not v.strip():
            raise ValueError("Сообщение не может состоять только из пробелов")
        return v


class MessageResponse(BaseModel):
    """Ответ с данными сообщения."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: uuid.UUID
    text: str
    kind: str = "text"
    order_id: uuid.UUID | None = None
    payload: dict | None = None
    is_read: bool = False
    created_at: datetime


class ConversationResponse(BaseModel):
    """История переписки с пагинацией."""

    items: list[MessageResponse]
    total: int
    page: int
    page_size: int
    partner: ChatPartner | None = None


class ChatPartner(BaseModel):
    """Собеседник в списке чатов и шапке переписки."""

    id: uuid.UUID
    name: str
    role: str
    photo_url: str | None = None
    # user_id для перехода в публичную карточку (если собеседник — автор)
    is_blogger: bool = False


class ThreadResponse(BaseModel):
    """Тред в списке чатов: собеседник + последнее сообщение + непрочитанные."""

    partner: ChatPartner
    last_message: MessageResponse
    unread_count: int = 0


class ThreadsListResponse(BaseModel):
    items: list[ThreadResponse]
    total_unread: int = 0


class UserPeekResponse(BaseModel):
    """Мини-профиль пользователя для просмотра из чата.

    Показывает публичную информацию: имя, аватар, роль, рейтинг (звёзды
    из отзывов), дату регистрации. Текст отзывов остаётся приватным.
    """

    id: uuid.UUID
    name: str
    role: str
    photo_url: str | None = None
    is_blogger: bool = False
    rating: float | None = None
    reviews_count: int = 0
    completed_orders: int = 0
    registered_at: datetime | None = None
    # Для авторов — ссылка на публичную карточку
    category: str | None = None


ConversationResponse.model_rebuild()
