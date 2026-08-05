"""Роутер уведомлений маркетплейса.

Предоставляет эндпоинты для получения списка in-app уведомлений
и отметки уведомлений как прочитанных. Доступно любому авторизованному пользователю.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.marketplace_notifications import (
    MarkReadRequest,
    NotificationListResponse,
    NotificationResponse,
)
from schemas.me import TelegramConnectResponse
from services import notification_service
from services.telegram_notify_service import build_connect_url

router = APIRouter(prefix="/marketplace/notifications", tags=["marketplace-notifications"])


@router.get("", response_model=NotificationListResponse)
async def get_notifications(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
    unread_only: bool = Query(default=False, description="Только непрочитанные"),
) -> NotificationListResponse:
    """Список уведомлений текущего пользователя с пагинацией.

    Любой авторизованный пользователь может получить свои уведомления.
    Сортировка: сначала новые (created_at DESC).
    """
    items, total = await notification_service.get_notifications(
        db=db,
        user_id=user.id,
        page=page,
        page_size=page_size,
        unread_only=unread_only,
    )

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(n) for n in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/telegram-connect", response_model=TelegramConnectResponse)
async def get_telegram_connect(
    user: Annotated[User, Depends(get_current_user)],
) -> TelegramConnectResponse:
    """Диплинк привязки Telegram-уведомлений для заказчика маркетплейса."""
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Привязка Telegram-уведомлений доступна заказчику",
        )
    return TelegramConnectResponse(
        connect_url=build_connect_url(user.id),
        connected=user.telegram_chat_id is not None,
    )


@router.patch("/read", status_code=200)
async def mark_notifications_read(
    body: MarkReadRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Отметить уведомления как прочитанные.

    Отмечает только уведомления, принадлежащие текущему пользователю.
    Уже прочитанные уведомления игнорируются без ошибки.
    """
    updated_count = await notification_service.mark_as_read(
        db=db,
        user_id=user.id,
        notification_ids=body.notification_ids,
    )
    await db.commit()

    return {"updated": updated_count}
