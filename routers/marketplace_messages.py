"""Роутер сообщений маркетплейса.

Чаты между заказчиками и авторами: список тредов с непрочитанными,
история переписки, отправка сообщений, отметка о прочтении и
мини-профиль собеседника.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus
from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.user import User
from schemas.marketplace_messages import (
    ChatPartner,
    ConversationResponse,
    MessageResponse,
    MessageSendRequest,
    ThreadResponse,
    ThreadsListResponse,
    UserPeekResponse,
)
from services import marketplace_message_service, marketplace_review_service

router = APIRouter(prefix="/marketplace/messages", tags=["marketplace-messages"])

_CHAT_ROLES = (UserRole.CLIENT, UserRole.BLOGER)


def _ensure_chat_role(user: User) -> None:
    if user.role not in _CHAT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Чаты доступны только заказчикам и авторам",
        )


def _chat_partner(partner: User, profile: BloggerProfile | None) -> ChatPartner:
    return ChatPartner(
        id=partner.id,
        name=partner.name,
        role=partner.role.value if hasattr(partner.role, "value") else str(partner.role),
        photo_url=marketplace_message_service.partner_photo_url(partner, profile),
        is_blogger=marketplace_message_service.is_blogger_user(partner),
    )


@router.get("", response_model=ThreadsListResponse)
async def list_threads(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ThreadsListResponse:
    """Список чатов пользователя: собеседник, последнее сообщение, непрочитанные."""
    _ensure_chat_role(user)

    threads = await marketplace_message_service.list_threads(db, user.id)
    items = [
        ThreadResponse(
            partner=_chat_partner(t["partner"], t["partner_profile"]),
            last_message=MessageResponse.model_validate(t["last_message"]),
            unread_count=t["unread_count"],
        )
        for t in threads
    ]
    return ThreadsListResponse(
        items=items,
        total_unread=sum(t["unread_count"] for t in threads),
    )


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
    _ensure_chat_role(user)

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
    """История переписки с конкретным пользователем.

    Страница 1 — самые свежие сообщения (хвост переписки), внутри страницы
    порядок хронологический. Включает данные собеседника для шапки чата.
    """
    _ensure_chat_role(user)

    partner = (
        await db.execute(select(User).where(User.id == partner_id))
    ).scalar_one_or_none()
    if partner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Собеседник не найден"
        )

    messages, total = await marketplace_message_service.get_conversation(
        db=db,
        user_id=user.id,
        partner_id=partner_id,
        page=page,
        page_size=page_size,
    )

    profile = (
        await db.execute(
            select(BloggerProfile).where(BloggerProfile.user_id == partner_id)
        )
    ).scalar_one_or_none()

    return ConversationResponse(
        items=[MessageResponse.model_validate(m) for m in messages],
        total=total,
        page=page,
        page_size=page_size,
        partner=_chat_partner(partner, profile),
    )


@router.patch("/{partner_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    partner_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Пометить все входящие сообщения треда прочитанными."""
    _ensure_chat_role(user)
    await marketplace_message_service.mark_thread_read(db, user.id, partner_id)
    await db.commit()


@router.get("/{partner_id}/peek", response_model=UserPeekResponse)
async def peek_user(
    partner_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserPeekResponse:
    """Мини-профиль собеседника: имя, аватар, рейтинг, число сделок.

    Текст отзывов приватен — наружу отдаются только звёзды и агрегаты.
    """
    _ensure_chat_role(user)

    partner = (
        await db.execute(select(User).where(User.id == partner_id))
    ).scalar_one_or_none()
    # Профили доступны только для участников чатов — заказчиков и авторов;
    # зондирование произвольных user_id (админы, воркеры) не разрешаем.
    if partner is None or partner.role not in _CHAT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )

    profile = (
        await db.execute(
            select(BloggerProfile).where(BloggerProfile.user_id == partner_id)
        )
    ).scalar_one_or_none()

    rating, reviews_count = await marketplace_review_service.user_rating_summary(
        db, partner_id
    )

    completed_orders = (
        await db.execute(
            select(func.count(MarketplaceOrder.id)).where(
                (
                    (MarketplaceOrder.client_id == partner_id)
                    | (MarketplaceOrder.blogger_id == partner_id)
                ),
                MarketplaceOrder.status == MarketplaceOrderStatus.COMPLETED.value,
            )
        )
    ).scalar_one()

    # Дата регистрации — первая сессия пользователя (может отсутствовать)
    registered_at = None
    try:
        from models.user_session import UserSession

        registered_at = (
            await db.execute(
                select(func.min(UserSession.created_at)).where(
                    UserSession.user_id == partner_id
                )
            )
        ).scalar_one_or_none()
    except Exception:  # pragma: no cover
        registered_at = None

    return UserPeekResponse(
        id=partner.id,
        name=partner.name,
        role=partner.role.value if hasattr(partner.role, "value") else str(partner.role),
        photo_url=marketplace_message_service.partner_photo_url(partner, profile),
        is_blogger=marketplace_message_service.is_blogger_user(partner),
        rating=rating,
        reviews_count=reviews_count,
        completed_orders=int(completed_orders or 0),
        registered_at=registered_at,
        category=profile.category if profile is not None else None,
    )
