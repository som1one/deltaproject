"""Роутер сообщений маркетплейса.

Обеспечивает отправку сообщений между заказчиками и блогерами
и просмотр истории переписки с пагинацией.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.marketplace_messages import (
    ConversationResponse,
    MessageResponse,
    MessageSendRequest,
)
from services import marketplace_message_service

router = APIRouter(prefix="/marketplace/messages", tags=["marketplace-messages"])


@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    body: MessageSendRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Отправить сообщение на маркетплейсе.

    Доступно только пользователям с ролью Client или Blogger.
    Текст сообщения: 1–2000 символов, не может состоять только из пробелов.
    """
    if user.role not in (UserRole.CLIENT, UserRole.BLOGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Отправка сообщений доступна только клиентам и блогерам",
        )

    try:
        message = await marketplace_message_service.send_message(
            db=db,
            sender_id=user.id,
            recipient_id=body.recipient_id,
            text=body.text,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    await db.commit()
    await db.refresh(message)

    return MessageResponse.model_validate(message)


@router.get("/{partner_id}", response_model=ConversationResponse)
async def get_conversation(
    partner_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=50, ge=1, le=100, description="Размер страницы"),
) -> ConversationResponse:
    """Получить историю переписки с конкретным пользователем.

    Доступно участникам переписки (Client или Blogger) и Admin.
    Сообщения возвращаются в хронологическом порядке с пагинацией.
    """
    # Проверка доступа: только участники переписки или Admin
    if user.role == UserRole.ADMIN:
        # Admin может видеть любую переписку
        pass
    elif user.role in (UserRole.CLIENT, UserRole.BLOGER):
        # Участник переписки — пользователь сам запрашивает свою переписку
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к переписке",
        )

    messages, total = await marketplace_message_service.get_conversation(
        db=db,
        user_id=user.id,
        partner_id=partner_id,
        page=page,
        page_size=page_size,
    )

    return ConversationResponse(
        items=[MessageResponse.model_validate(m) for m in messages],
        total=total,
        page=page,
        page_size=page_size,
    )
