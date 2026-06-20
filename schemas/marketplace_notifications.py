from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """Ответ с данными одного уведомления."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    event_type: str
    payload: dict[str, Any]
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Список уведомлений с пагинацией."""

    items: list[NotificationResponse]
    total: int
    page: int
    page_size: int


class MarkReadRequest(BaseModel):
    """Запрос на отметку уведомлений как прочитанных."""

    notification_ids: list[uuid.UUID] = Field(
        ..., min_length=1, description="Список ID уведомлений для отметки"
    )
