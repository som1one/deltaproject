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
    created_at: datetime


class ConversationResponse(BaseModel):
    """История переписки с пагинацией."""

    items: list[MessageResponse]
    total: int
    page: int
    page_size: int
