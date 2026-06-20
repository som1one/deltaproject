"""Marketplace Message Service.

Handles sending and retrieving messages between clients and bloggers
on the marketplace platform.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.marketplace_message import MarketplaceMessage
from models.notification import Notification


async def send_message(
    db: AsyncSession,
    sender_id: uuid.UUID,
    recipient_id: uuid.UUID,
    text: str,
) -> MarketplaceMessage:
    """Отправить сообщение на маркетплейсе.

    Валидирует текст (1–2000 символов, не только пробелы), сохраняет
    сообщение в БД и создаёт уведомление получателю.

    Args:
        db: Async database session.
        sender_id: UUID отправителя.
        recipient_id: UUID получателя.
        text: Текст сообщения.

    Returns:
        Созданный объект MarketplaceMessage.

    Raises:
        ValueError: Если текст не проходит валидацию.
    """
    # Валидация текста
    if not text or not text.strip():
        raise ValueError("Сообщение не может быть пустым или состоять только из пробелов")
    if len(text) > 2000:
        raise ValueError("Сообщение не может превышать 2000 символов")

    # Создание сообщения
    message = MarketplaceMessage(
        sender_id=sender_id,
        recipient_id=recipient_id,
        text=text,
    )
    db.add(message)
    await db.flush()

    # Создание уведомления получателю
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

    Args:
        db: Async database session.
        user_id: UUID текущего пользователя.
        partner_id: UUID собеседника.
        page: Номер страницы (1-based).
        page_size: Количество сообщений на странице.

    Returns:
        Tuple: (список сообщений, общее количество).
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    offset = (page - 1) * page_size

    # Фильтр: сообщения между user_id и partner_id (в обоих направлениях)
    conversation_filter = or_(
        (MarketplaceMessage.sender_id == user_id)
        & (MarketplaceMessage.recipient_id == partner_id),
        (MarketplaceMessage.sender_id == partner_id)
        & (MarketplaceMessage.recipient_id == user_id),
    )

    # Подсчёт общего количества сообщений
    count_stmt = select(func.count(MarketplaceMessage.id)).where(conversation_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Получение сообщений с пагинацией в хронологическом порядке
    stmt = (
        select(MarketplaceMessage)
        .where(conversation_filter)
        .order_by(MarketplaceMessage.created_at.asc())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    return list(rows), total
