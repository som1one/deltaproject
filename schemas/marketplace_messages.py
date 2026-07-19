from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class MessageSendRequest(BaseModel):
    """Запрос на отправку сообщения на маркетплейсе.

    Либо текст, либо вложение из /marketplace/uploads[/chat] (можно вместе).
    """

    recipient_id: uuid.UUID
    text: Annotated[str, Field(max_length=2000)] = ""
    # Путь вида /uploads/[chat/]<uuid>.<ext>, выданный эндпоинтом загрузки
    attachment_url: Annotated[str, Field(max_length=300)] | None = None
    # Оригинальное имя и размер файла — для карточки вложения в чате
    attachment_name: Annotated[str, Field(max_length=200)] | None = None
    attachment_size: Annotated[int, Field(ge=0, le=200 * 1024 * 1024)] | None = None

    @model_validator(mode="after")
    def validate_content(self) -> "MessageSendRequest":
        """Пустое сообщение допустимо только с вложением."""
        if not self.text.strip() and not self.attachment_url:
            raise ValueError("Сообщение не может быть пустым")
        if self.attachment_url is not None and (
            not self.attachment_url.startswith("/uploads/")
            or ".." in self.attachment_url
        ):
            raise ValueError("Недопустимая ссылка на вложение")
        return self


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
