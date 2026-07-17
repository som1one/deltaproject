"""State machine для переходов статусов MarketplaceOrder.

Определяет допустимые переходы между статусами и обеспечивает
атомарное обновление статуса с записью в OrderStatusHistory.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from enums.marketplace import MarketplaceOrderStatus
from models.marketplace_order import MarketplaceOrder
from models.order_status_history import OrderStatusHistory

# Допустимые переходы: из текущего статуса → множество допустимых целевых статусов
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    # Оффер ждёт решения исполнителя: принять (→ оплата), отклонить,
    # либо инициатор может отозвать предложение (→ отмена).
    MarketplaceOrderStatus.OFFER_PENDING.value: {
        MarketplaceOrderStatus.PENDING_PAYMENT.value,
        MarketplaceOrderStatus.OFFER_DECLINED.value,
        MarketplaceOrderStatus.CANCELLED.value,
    },
    MarketplaceOrderStatus.PENDING_PAYMENT.value: {
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.CANCELLED.value,
    },
    MarketplaceOrderStatus.ESCROW_HELD.value: {
        MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        MarketplaceOrderStatus.REFUNDED.value,
    },
    # Сдача работы: приёмка (→ завершение), возврат на доработку с причиной
    # (→ обратно в работу), либо спор с возвратом средств.
    MarketplaceOrderStatus.BLOGGER_CONFIRMED.value: {
        MarketplaceOrderStatus.COMPLETED.value,
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.REFUNDED.value,
    },
    # Оплата не прошла (онлайн-платёж отменён/просрочен) — НЕ терминал:
    # заказчик может вернуться к оплате и попробовать снова.
    MarketplaceOrderStatus.PAYMENT_FAILED.value: {
        MarketplaceOrderStatus.PENDING_PAYMENT.value,
    },
    # Терминальные статусы — переходов нет
    MarketplaceOrderStatus.COMPLETED.value: set(),
    MarketplaceOrderStatus.REFUNDED.value: set(),
    MarketplaceOrderStatus.CANCELLED.value: set(),
    MarketplaceOrderStatus.OFFER_DECLINED.value: set(),
}


def validate_transition(current: str, target: str) -> bool:
    """Проверяет допустимость перехода из current в target.

    Args:
        current: Текущий статус заказа (значение enum).
        target: Целевой статус заказа (значение enum).

    Returns:
        True если переход допустим, False иначе.
    """
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    return target in allowed


async def transition_order(
    db: AsyncSession,
    order: MarketplaceOrder,
    target_status: MarketplaceOrderStatus,
    changed_by: uuid.UUID,
    reason: str | None = None,
) -> MarketplaceOrder:
    """Атомарно обновить статус заказа и создать запись в OrderStatusHistory.

    Args:
        db: Асинхронная сессия SQLAlchemy.
        order: Объект заказа (должен быть в сессии).
        target_status: Целевой статус.
        changed_by: UUID пользователя, инициировавшего переход.
        reason: Опциональная причина перехода (для refund/cancel).

    Returns:
        Обновлённый объект заказа.

    Raises:
        HTTPException(409): Если переход недопустим.
    """
    current_status = order.status
    target_value = target_status.value

    if not validate_transition(current_status, target_value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Переход из {current_status} в {target_value} недопустим",
        )

    # Атомарное обновление статуса
    old_status = current_status
    order.status = target_value

    # Запись в историю статусов
    history_entry = OrderStatusHistory(
        order_id=order.id,
        old_status=old_status,
        new_status=target_value,
        changed_by=changed_by,
        reason=reason,
    )
    db.add(history_entry)

    await db.flush()

    return order
