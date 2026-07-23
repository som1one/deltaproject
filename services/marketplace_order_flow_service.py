"""Полный цикл заказа маркетплейса: оффер → принятие → работа → сдача → приёмка.

Инкапсулирует создание офферов (из карточки автора и из чата), фиксацию
сроков при принятии, сдачу работы с 3-дневным окном приёмки и
авто-подтверждение просроченных приёмок.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.marketplace import MarketplaceOrderStatus
from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.marketplace_service_type import MarketplaceServiceType
from models.marketplace_settings import MarketplaceSettings
from models.user import User
from services import marketplace_escrow_service, marketplace_message_service, notification_service
from services.marketplace_referral_service import (
    get_worker_id_for_order,
    resolve_blogger_referrer_id,
)
from services.order_state_machine import transition_order

logger = logging.getLogger(__name__)

# Сколько дней у заказчика на приёмку сданной работы
REVIEW_WINDOW_DAYS = 3


class OrderFlowError(ValueError):
    """Бизнес-ошибка цикла заказа (транслируется в HTTP 400/422)."""


async def resolve_service_type(
    db: AsyncSession, service_type_id: uuid.UUID | None
) -> MarketplaceServiceType | None:
    """Найти активный тип услуги из реестра (или None, если не указан)."""
    if service_type_id is None:
        return None
    service_type = (
        await db.execute(
            select(MarketplaceServiceType).where(
                MarketplaceServiceType.id == service_type_id,
                MarketplaceServiceType.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if service_type is None:
        raise OrderFlowError("Тип услуги не найден в реестре")
    return service_type


def offer_payload(order: MarketplaceOrder) -> dict:
    """Снапшот условий оффера для карточки-сообщения в чате."""
    return {
        "order_id": str(order.id),
        "service_type_name": order.service_type_name,
        "amount_kopeks": order.amount_kopeks,
        "deadline_days": order.deadline_days,
        "publish_at": order.publish_at.isoformat() if order.publish_at else None,
        "message": order.message,
        "status": order.status,
    }


async def create_offer(
    db: AsyncSession,
    *,
    sender: User,
    client_id: uuid.UUID,
    blogger_id: uuid.UUID,
    message: str,
    amount_kopeks: int,
    service_type_id: uuid.UUID | None,
    deadline_days: int | None,
    publish_at: datetime | None,
) -> MarketplaceOrder:
    """Создать оффер (OFFER_PENDING) и offer-сообщение в чате.

    Вызывается и из карточки автора (sender == клиент), и из чата
    (sender — любая из сторон). Комиссии снимаются снапшотом сразу,
    воркер определяется по рефералке клиента.
    """
    profile = (
        await db.execute(
            select(BloggerProfile).where(BloggerProfile.user_id == blogger_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        raise OrderFlowError("Профиль автора не найден")
    # Автор сам может предложить услугу из чата даже со скрытой карточкой
    # или на паузе — ограничения касаются только входящих заказов.
    if not profile.is_active and sender.id != blogger_id:
        raise OrderFlowError("Автор скрыл карточку и не принимает заказы")
    if not profile.orders_enabled and sender.id != blogger_id:
        raise OrderFlowError("Автор приостановил приём заказов")

    client = (
        await db.execute(select(User).where(User.id == client_id))
    ).scalar_one_or_none()
    if client is None or not client.is_active:
        raise OrderFlowError("Заказчик не найден")
    if client.role != UserRole.CLIENT:
        raise OrderFlowError("Заказы оформляются только на аккаунт заказчика")

    blogger_user = (
        await db.execute(select(User).where(User.id == blogger_id))
    ).scalar_one_or_none()
    if blogger_user is None or not blogger_user.is_active:
        raise OrderFlowError("Автор недоступен для заказов")

    if publish_at is not None:
        # Сравниваем по дню, а не по моменту: «опубликовать сегодня» — валидно
        # из любого часового пояса.
        now = datetime.now(timezone.utc)
        publish_norm = publish_at if publish_at.tzinfo else publish_at.replace(tzinfo=timezone.utc)
        if publish_norm.date() < now.date():
            raise OrderFlowError("Дата публикации не может быть в прошлом")

    service_type = await resolve_service_type(db, service_type_id)

    settings_row = (
        await db.execute(select(MarketplaceSettings).where(MarketplaceSettings.id == 1))
    ).scalar_one_or_none()
    if settings_row is None:
        raise OrderFlowError("Настройки маркетплейса не найдены")

    worker_id = get_worker_id_for_order(client)
    worker_commission_pct = (
        settings_row.worker_referral_commission_pct
        if worker_id is not None
        else Decimal("0.00")
    )

    # 2-й уровень: блогер, приведший этого воркера (снапшот на момент заказа)
    blogger_referrer_id = await resolve_blogger_referrer_id(worker_id, db)
    blogger_referrer_commission_pct = (
        settings_row.blogger_referral_commission_pct
        if blogger_referrer_id is not None
        else Decimal("0.00")
    )

    order = MarketplaceOrder(
        client_id=client_id,
        blogger_id=blogger_id,
        worker_id=worker_id,
        blogger_referrer_id=blogger_referrer_id,
        status=MarketplaceOrderStatus.OFFER_PENDING.value,
        amount_kopeks=amount_kopeks,
        message=message,
        platform_commission_pct=settings_row.platform_commission_pct,
        worker_commission_pct=worker_commission_pct,
        blogger_referrer_commission_pct=blogger_referrer_commission_pct,
        service_type_id=service_type.id if service_type else None,
        service_type_name=service_type.name if service_type else None,
        offered_by=sender.id,
        deadline_days=deadline_days,
        publish_at=publish_at,
    )
    db.add(order)
    await db.flush()

    recipient_id = blogger_id if sender.id != blogger_id else client_id
    await marketplace_message_service.send_message(
        db=db,
        sender_id=sender.id,
        recipient_id=recipient_id,
        text=message[:2000],
        kind="offer",
        order_id=order.id,
        payload=offer_payload(order),
    )

    await notification_service.notify(
        db=db,
        user_id=recipient_id,
        event_type="order_offer",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "from_name": sender.name,
        },
    )

    return order


def acceptor_id(order: MarketplaceOrder) -> uuid.UUID:
    """Кто должен принять оффер: противоположная предложившему сторона."""
    if order.offered_by == order.blogger_id:
        return order.client_id
    return order.blogger_id


async def send_system_message(
    db: AsyncSession,
    *,
    order: MarketplaceOrder,
    actor_id: uuid.UUID,
    text: str,
) -> None:
    """Служебное сообщение о событии сделки в чат между сторонами."""
    recipient_id = (
        order.blogger_id if actor_id == order.client_id else order.client_id
    )
    try:
        await marketplace_message_service.send_message(
            db=db,
            sender_id=actor_id,
            recipient_id=recipient_id,
            text=text,
            kind="system",
            order_id=order.id,
            payload={"order_id": str(order.id), "status": order.status},
        )
    except ValueError:
        # Чат не должен ронять переход статуса (например, получатель деактивирован)
        logger.warning("Не удалось создать system-сообщение для заказа %s", order.id)


async def accept_offer(
    db: AsyncSession, order: MarketplaceOrder, actor: User
) -> MarketplaceOrder:
    """Принять оффер: OFFER_PENDING → PENDING_PAYMENT, зафиксировать сроки.

    Отсчёт сроков начинается с момента принятия: deadline_at =
    accepted_at + deadline_days; если указана дата публикации — она
    становится дедлайном (более ранняя из двух, если заданы обе).
    """
    if actor.id != acceptor_id(order):
        raise OrderFlowError("Принять предложение может только его получатель")

    order = await transition_order(
        db, order, MarketplaceOrderStatus.PENDING_PAYMENT, actor.id
    )
    now = datetime.now(timezone.utc)
    order.accepted_at = now

    deadline_candidates: list[datetime] = []
    if order.deadline_days:
        deadline_candidates.append(now + timedelta(days=order.deadline_days))
    if order.publish_at:
        publish = order.publish_at
        if publish.tzinfo is None:
            publish = publish.replace(tzinfo=timezone.utc)
        # Дедлайн по дате публикации — конец этого дня; если день уже
        # прошёл, пока оффер ждал ответа, дата не должна давать
        # «просроченный с рождения» дедлайн.
        publish_eod = publish.replace(hour=23, minute=59, second=59, microsecond=0)
        if publish_eod > now:
            deadline_candidates.append(publish_eod)
    order.deadline_at = min(deadline_candidates) if deadline_candidates else None

    await send_system_message(
        db,
        order=order,
        actor_id=actor.id,
        text="Предложение принято. Ожидается оплата на счёт платформы.",
    )
    await notification_service.notify(
        db=db,
        user_id=order.client_id if actor.id != order.client_id else order.blogger_id,
        event_type="order_accepted",
        payload={"order_id": str(order.id), "by_name": actor.name},
    )
    return order


async def decline_offer(
    db: AsyncSession, order: MarketplaceOrder, actor: User, reason: str | None
) -> MarketplaceOrder:
    """Отклонить оффер: OFFER_PENDING → OFFER_DECLINED."""
    if actor.id != acceptor_id(order):
        raise OrderFlowError("Отклонить предложение может только его получатель")

    order = await transition_order(
        db, order, MarketplaceOrderStatus.OFFER_DECLINED, actor.id, reason=reason
    )
    order.decline_reason = reason

    await send_system_message(
        db,
        order=order,
        actor_id=actor.id,
        text=f"Предложение отклонено. {reason}".strip() if reason else "Предложение отклонено.",
    )
    await notification_service.notify(
        db=db,
        user_id=order.offered_by or order.client_id,
        event_type="order_declined",
        payload={"order_id": str(order.id), "by_name": actor.name, "reason": reason},
    )
    return order


async def submit_work(
    db: AsyncSession, order: MarketplaceOrder, actor: User, result: str
) -> MarketplaceOrder:
    """Сдать работу: ESCROW_HELD → BLOGGER_CONFIRMED, окно приёмки 3 дня."""
    order = await transition_order(
        db, order, MarketplaceOrderStatus.BLOGGER_CONFIRMED, actor.id
    )
    now = datetime.now(timezone.utc)
    order.blogger_confirmed_at = now
    order.work_submitted_at = now
    order.work_result = result
    order.review_deadline_at = now + timedelta(days=REVIEW_WINDOW_DAYS)

    await send_system_message(
        db,
        order=order,
        actor_id=actor.id,
        text=(
            "Работа сдана на проверку. У заказчика есть "
            f"{REVIEW_WINDOW_DAYS} дня, чтобы подтвердить или вернуть на доработку."
        ),
    )
    await notification_service.notify(
        db=db,
        user_id=order.client_id,
        event_type="work_submitted",
        payload={"order_id": str(order.id), "blogger_name": actor.name},
    )
    return order


async def request_changes(
    db: AsyncSession, order: MarketplaceOrder, actor: User, reason: str
) -> MarketplaceOrder:
    """Вернуть работу на доработку: BLOGGER_CONFIRMED → ESCROW_HELD.

    Просто так отменить заказ заказчик не может — только возврат с
    причиной; деньги остаются на счёте платформы.
    """
    order = await transition_order(
        db, order, MarketplaceOrderStatus.ESCROW_HELD, actor.id, reason=reason
    )
    order.decline_reason = reason
    order.review_deadline_at = None
    order.work_submitted_at = None

    await send_system_message(
        db,
        order=order,
        actor_id=actor.id,
        text=f"Работа возвращена на доработку: {reason}",
    )
    await notification_service.notify(
        db=db,
        user_id=order.blogger_id,
        event_type="work_changes_requested",
        payload={"order_id": str(order.id), "reason": reason},
    )
    return order


async def auto_complete_overdue_reviews(db: AsyncSession) -> int:
    """Авто-приёмка: сданные работы без ответа заказчика 3 дня → COMPLETED.

    Вызывается фоновым свипером. Возвращает число завершённых заказов.
    Заказы с открытым тикетом поддержки пропускаются — спор должен решить
    админ (favor_client вернёт деньги, favor_blogger распределит их).
    Каждый заказ обрабатывается в собственном savepoint: сбой одного заказа
    не отравляет транзакцию и не блокирует выплаты по остальным.
    """
    from enums.marketplace import SupportTicketStatus
    from models.support_ticket import SupportTicket

    now = datetime.now(timezone.utc)
    open_ticket_exists = (
        select(SupportTicket.id)
        .where(
            SupportTicket.order_id == MarketplaceOrder.id,
            SupportTicket.status == SupportTicketStatus.OPEN.value,
        )
        .exists()
    )
    orders = (
        await db.execute(
            select(MarketplaceOrder)
            .where(
                MarketplaceOrder.status
                == MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
                MarketplaceOrder.review_deadline_at.is_not(None),
                MarketplaceOrder.review_deadline_at < now,
                ~open_ticket_exists,
            )
            .with_for_update(skip_locked=True)
        )
    ).scalars().all()

    completed = 0
    for order in orders:
        try:
            async with db.begin_nested():
                await transition_order(
                    db,
                    order,
                    MarketplaceOrderStatus.COMPLETED,
                    order.client_id,
                    reason="Авто-подтверждение: заказчик не ответил в течение 3 дней",
                )
                order.completed_at = now
                await marketplace_escrow_service.distribute_funds(
                    order_id=order.id, db=db
                )
                await notification_service.notify(
                    db=db,
                    user_id=order.blogger_id,
                    event_type="order_completed",
                    payload={"order_id": str(order.id), "amount": order.amount_kopeks},
                )
                if order.worker_id is not None:
                    await notification_service.notify(
                        db=db,
                        user_id=order.worker_id,
                        event_type="order_completed_worker_commission",
                        payload={
                            "order_id": str(order.id),
                            "amount": order.amount_kopeks,
                        },
                    )
                if order.blogger_referrer_id is not None:
                    await notification_service.notify(
                        db=db,
                        user_id=order.blogger_referrer_id,
                        event_type="order_completed_blogger_commission",
                        payload={
                            "order_id": str(order.id),
                            "amount": order.amount_kopeks,
                        },
                    )
            completed += 1
        except Exception:  # pragma: no cover — savepoint откатил только этот заказ
            logger.exception("Авто-приёмка заказа %s не удалась", order.id)

    return completed
