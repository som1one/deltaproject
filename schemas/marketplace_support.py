from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from enums.marketplace import SupportTicketStatus
from enums.user import UserRole


class TicketCreateRequest(BaseModel):
    """Запрос на создание тикета поддержки."""

    order_id: uuid.UUID
    message: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("message")
    @classmethod
    def validate_message_not_whitespace(cls, v: str) -> str:
        """Сообщение не должно состоять только из пробелов."""
        if not v.strip():
            raise ValueError("Сообщение не может состоять только из пробелов")
        return v


class TicketResponse(BaseModel):
    """Ответ с данными тикета поддержки."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    order_id: uuid.UUID
    submitter_id: uuid.UUID
    submitter_role: UserRole
    message: str
    status: SupportTicketStatus
    resolved_by: uuid.UUID | None = None
    resolution_decision: str | None = None
    resolution_reason: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime


class TicketListResponse(BaseModel):
    """Список тикетов с пагинацией."""

    items: list[TicketResponse]
    total: int
    page: int
    page_size: int
