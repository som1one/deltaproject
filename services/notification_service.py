"""Сервис in-app уведомлений.

Создаёт, возвращает (с пагинацией) и помечает прочитанными
in-app нотификации для пользователей платформы.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.notification import Notification


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> Notification:
    """Создать in-app уведомление для пользователя.

    Args:
        db: Асинхронная сессия БД.
        user_id: ID пользователя-получателя.
        event_type: Тип события (макс. 50 символов).
        payload: Произвольные данные уведомления (JSONB).

    Returns:
        Созданный объект Notification.
    """
    notification = Notification(
        user_id=user_id,
        event_type=event_type,
        payload=payload,
    )
    db.add(notification)
    await db.flush()
    return notification


async def get_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    """Получить пагинированный список уведомлений пользователя.

    Сортировка: newest first (created_at DESC).
    Offset-based пагинация.

    Args:
        db: Асинхронная сессия БД.
        user_id: ID пользователя.
        page: Номер страницы (начиная с 1).
        page_size: Количество записей на страницу.
        unread_only: Если True — возвращать только непрочитанные.

    Returns:
        Кортеж (список уведомлений, общее количество).
    """
    base_filter = Notification.user_id == user_id
    filters = [base_filter]

    if unread_only:
        filters.append(Notification.is_read == False)  # noqa: E712

    # Подсчёт общего количества
    count_stmt = select(func.count(Notification.id)).where(*filters)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Основной запрос с пагинацией
    offset = (page - 1) * page_size
    query = (
        select(Notification)
        .where(*filters)
        .order_by(Notification.created_at.desc())
        .limit(page_size)
        .offset(offset)
    )
    rows = (await db.execute(query)).scalars().all()

    return list(rows), total


async def mark_as_read(
    db: AsyncSession,
    user_id: uuid.UUID,
    notification_ids: list[uuid.UUID],
) -> int:
    """Отметить уведомления как прочитанные (только свои).

    Обновляет только те записи, которые принадлежат указанному user_id.
    Уже прочитанные уведомления не вызывают ошибку.

    Args:
        db: Асинхронная сессия БД.
        user_id: ID пользователя (для проверки владения).
        notification_ids: Список ID уведомлений для отметки.

    Returns:
        Количество обновлённых записей.
    """
    if not notification_ids:
        return 0

    stmt = (
        update(Notification)
        .where(
            Notification.id.in_(notification_ids),
            Notification.user_id == user_id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount  # type: ignore[return-value]
