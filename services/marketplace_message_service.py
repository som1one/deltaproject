"""Marketplace Message Service.

Handles sending and retrieving messages between clients and bloggers
on the marketplace platform: списки тредов, счётчики непрочитанных,
offer/system-сообщения, привязанные к заказам.
"""

from __future__ import annotations

import uuid

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_message import MarketplaceMessage
from models.notification import Notification
from models.user import User


async def send_message(
    db: AsyncSession,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    text: str,
    kind: str = "text",
    order_id: uuid.UUID | None = None,
    payload: dict | None = None,
    attachment_url: str | None = None,
) -> MarketplaceMessage:
    """Отправить сообщение на маркетплейсе.

    Валидирует текст (1–2000 символов, не только пробелы; пустой текст
    допустим при вложении), проверяет существование получателя,
    сохраняет сообщение и создаёт уведомление.

    Args:
        db: Async database session.
        sender_id: UUID отправителя.
        recipient_id: UUID получателя.
        text: Текст сообщения.
        kind: 'text' | 'image' | 'offer' | 'system'.
        order_id: Привязка к заказу для offer/system-сообщений.
        payload: Снапшот условий оффера для карточки в чате.
        attachment_url: Картинка из /marketplace/uploads (kind станет 'image').

    Returns:
        Созданный объект MarketplaceMessage.

    Raises:
        ValueError: Если текст или получатель не проходят валидацию.
    """
    if (not text or not text.strip()) and attachment_url is None:
        raise ValueError("Сообщение не может быть пустым или состоять только из пробелов")
    if len(text) > 2000:
        raise ValueError("Сообщение не может превышать 2000 символов")
    if sender_id == recipient_id:
        raise ValueError("Нельзя отправить сообщение самому себе")

    recipient = (
        await db.execute(select(User).where(User.id == recipient_id))
    ).scalar_one_or_none()
    if recipient is None or not recipient.is_active:
        raise ValueError("Получатель не найден")
    # Чаты существуют только между заказчиками и авторами — DM админам,
    # воркерам и прочим ролям недоступны (защита от спама уведомлениями).
    if recipient.role not in (UserRole.CLIENT, UserRole.BLOGER):
        raise ValueError("Получатель недоступен для переписки")

    if attachment_url is not None:
        kind = "image"
        payload = {**(payload or {}), "attachment_url": attachment_url}

    message = MarketplaceMessage(
        sender_id=sender_id,
        recipient_id=recipient_id,
        text=text.strip(),
        kind=kind,
        order_id=order_id,
        payload=payload,
    )
    db.add(message)
    await db.flush()

    notification = Notification(
        user_id=recipient_id,
        event_type="new_message",
        payload={
            "message_id": str(message.id),
            "sender_id": str(sender_id),
            "text_preview": text[:100],
        },
    )
    db.add(notification)
    await db.flush()

    return message


async def get_conversation(
    db: AsyncSession,
    user_id: uuid.UUID,
    partner_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[MarketplaceMessage], int]:
    """Получить переписку между двумя пользователями с пагинацией.

    Возвращает сообщения в хронологическом порядке (старые сначала).
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    offset = (page - 1) * page_size

    conversation_filter = or_(
        (MarketplaceMessage.sender_id == user_id)
        & (MarketplaceMessage.recipient_id == partner_id),
        (MarketplaceMessage.sender_id == partner_id)
        & (MarketplaceMessage.recipient_id == user_id),
    )

    count_stmt = select(func.count(MarketplaceMessage.id)).where(conversation_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Последняя страница по умолчанию неудобна для чатов: отдаём хвост
    # переписки — свежие сообщения, но в хронологическом порядке.
    stmt = (
        select(MarketplaceMessage)
        .where(conversation_filter)
        .order_by(MarketplaceMessage.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return list(reversed(rows)), total


async def mark_thread_read(
    db: AsyncSession,
    user_id: uuid.UUID,
    partner_id: uuid.UUID,
) -> int:
    """Пометить все входящие сообщения треда прочитанными.

    Returns:
        Количество помеченных сообщений.
    """
    result = await db.execute(
        update(MarketplaceMessage)
        .where(
            MarketplaceMessage.recipient_id == user_id,
            MarketplaceMessage.sender_id == partner_id,
            MarketplaceMessage.is_read.is_(False),
        )
        .values(is_read=True)
    )
    return result.rowcount or 0


async def list_threads(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[dict]:
    """Список тредов пользователя: собеседник, последнее сообщение, непрочитанные.

    Returns:
        Список словарей {partner: User, partner_profile: BloggerProfile | None,
        last_message: MarketplaceMessage, unread_count: int},
        отсортированный по времени последнего сообщения (свежие сверху).
    """
    partner_expr = case(
        (MarketplaceMessage.sender_id == user_id, MarketplaceMessage.recipient_id),
        else_=MarketplaceMessage.sender_id,
    )
    rn = (
        func.row_number()
        .over(partition_by=partner_expr, order_by=MarketplaceMessage.created_at.desc())
        .label("rn")
    )
    sub = (
        select(MarketplaceMessage.id.label("message_id"), rn)
        .where(
            or_(
                MarketplaceMessage.sender_id == user_id,
                MarketplaceMessage.recipient_id == user_id,
            )
        )
        .subquery()
    )
    last_ids = select(sub.c.message_id).where(sub.c.rn == 1)

    rows = (
        await db.execute(
            select(MarketplaceMessage)
            .where(MarketplaceMessage.id.in_(last_ids))
            .order_by(MarketplaceMessage.created_at.desc())
        )
    ).scalars().all()

    if not rows:
        return []

    partner_ids = {
        m.recipient_id if m.sender_id == user_id else m.sender_id for m in rows
    }

    users = {
        u.id: u
        for u in (
            await db.execute(select(User).where(User.id.in_(partner_ids)))
        ).scalars()
    }
    profiles = {
        p.user_id: p
        for p in (
            await db.execute(
                select(BloggerProfile).where(BloggerProfile.user_id.in_(partner_ids))
            )
        ).scalars()
    }

    unread_rows = (
        await db.execute(
            select(MarketplaceMessage.sender_id, func.count(MarketplaceMessage.id))
            .where(
                MarketplaceMessage.recipient_id == user_id,
                MarketplaceMessage.is_read.is_(False),
            )
            .group_by(MarketplaceMessage.sender_id)
        )
    ).all()
    unread_by_partner = {sender_id: count for sender_id, count in unread_rows}

    threads: list[dict] = []
    for message in rows:
        partner_id = (
            message.recipient_id if message.sender_id == user_id else message.sender_id
        )
        partner = users.get(partner_id)
        if partner is None:
            continue
        threads.append(
            {
                "partner": partner,
                "partner_profile": profiles.get(partner_id),
                "last_message": message,
                "unread_count": unread_by_partner.get(partner_id, 0),
            }
        )
    return threads


def partner_photo_url(partner: User, profile: BloggerProfile | None) -> str | None:
    """Аватар собеседника: у авторов — фото из профиля маркетплейса."""
    if profile is not None and profile.photo_url:
        return profile.photo_url
    return None


def is_blogger_user(partner: User) -> bool:
    return partner.role == UserRole.BLOGER
