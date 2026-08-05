"""Escrow-сервис маркетплейса блогеров.

Отвечает за замораживание, распределение и возврат средств по заказам.
Все суммы — в копейках (целочисленная арифметика, без float).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.marketplace import MarketplaceOrderStatus
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_order import MarketplaceOrder
from models.user import User
from services import telegram_notify_service
from services.notification_service import notify
from services.order_state_machine import transition_order

logger = logging.getLogger(__name__)


@dataclass
class DistributionResult:
    """Результат распределения средств по заказу."""

    blogger_share: int
    worker_share: int
    blogger_referral_share: int
    platform_share: int
    order_id: uuid.UUID


def calculate_distribution(
    amount_kopeks: int,
    platform_commission_pct: Decimal,
    worker_commission_pct: Decimal,
    blogger_referrer_commission_pct: Decimal = Decimal("0"),
) -> tuple[int, int, int, int]:
    """Рассчитать распределение средств.

    Returns:
        (blogger_share, worker_share, blogger_referral_share, platform_share) —
        все в копейках.

    Правила:
    - platform_share = floor(amount * platform_pct / 100)
    - worker_share = floor(amount * worker_pct / 100), 0 если нет реферала-воркера
    - blogger_referral_share = floor(amount * blogger_ref_pct / 100), 0 если нет
      блогера, приведшего воркера (2-й уровень рефералки)
    - blogger_share = amount - platform - worker - blogger_referral
      (остаток автору-продавцу; именно из него «вычитаются» рефкомиссии)
    - Инвариант: blogger + worker + blogger_referral + platform == amount
    """
    # Используем Decimal для точного вычисления, затем floor → int
    platform_share = int((Decimal(amount_kopeks) * platform_commission_pct / Decimal(100)).to_integral_value(rounding="ROUND_FLOOR"))
    worker_share = int((Decimal(amount_kopeks) * worker_commission_pct / Decimal(100)).to_integral_value(rounding="ROUND_FLOOR"))
    blogger_referral_share = int((Decimal(amount_kopeks) * blogger_referrer_commission_pct / Decimal(100)).to_integral_value(rounding="ROUND_FLOOR"))
    blogger_share = amount_kopeks - platform_share - worker_share - blogger_referral_share
    return blogger_share, worker_share, blogger_referral_share, platform_share


async def freeze_funds(
    order_id: uuid.UUID,
    amount_kopeks: int,
    db: AsyncSession,
) -> None:
    """Заморозить средства по заказу (создать ledger-запись типа 'freeze').

    Использует SELECT FOR UPDATE на строке заказа для конкурентной безопасности.
    Идемпотентно: если запись с таким idempotency_key уже существует — пропускает.
    """
    idempotency_key = f"{order_id}:freeze"

    # Проверка идемпотентности
    existing = await db.execute(
        select(MarketplaceEscrowEntry).where(
            MarketplaceEscrowEntry.idempotency_key == idempotency_key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("freeze_funds: уже выполнено для order_id=%s", order_id)
        return

    # Блокировка строки заказа
    order = (
        await db.execute(
            select(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if order is None:
        raise ValueError(f"Заказ {order_id} не найден")

    # Создаём запись заморозки (user_id = client_id, т.к. средства от клиента)
    entry = MarketplaceEscrowEntry(
        order_id=order_id,
        user_id=order.client_id,
        entry_type="freeze",
        amount_kopeks=amount_kopeks,
        note="Заморозка средств по заказу",
        idempotency_key=idempotency_key,
    )
    db.add(entry)
    await db.flush()


async def confirm_payment(
    order_id: uuid.UUID,
    admin_id: uuid.UUID,
    db: AsyncSession,
) -> MarketplaceOrder:
    """Админ подтверждает оплату: PENDING_PAYMENT → ESCROW_HELD + freeze.

    Логика:
    1. Проверка идемпотентности — если freeze уже выполнен, загружаем и возвращаем заказ.
    2. Загрузка заказа с блокировкой (SELECT FOR UPDATE).
    3. Проверка статуса PENDING_PAYMENT (409 если другой).
    4. Переход статуса через transition_order → ESCROW_HELD.
    5. Установка confirmed_by = admin_id.
    6. Вызов freeze_funds для создания ledger-записи.
    7. Уведомление блогеру о новом заказе в работе.

    Args:
        order_id: UUID заказа.
        admin_id: UUID администратора, подтверждающего оплату.
        db: Асинхронная сессия БД.

    Returns:
        Обновлённый объект MarketplaceOrder.

    Raises:
        HTTPException(404): Заказ не найден.
        HTTPException(409): Заказ не в статусе PENDING_PAYMENT (и не ESCROW_HELD).
    """
    # Проверка идемпотентности: если freeze уже создан — заказ уже подтверждён
    existing = await db.execute(
        select(MarketplaceEscrowEntry).where(
            MarketplaceEscrowEntry.idempotency_key == f"{order_id}:freeze",
        )
    )
    if existing.scalar_one_or_none() is not None:
        # Заказ уже подтверждён — вернуть текущее состояние
        order = (
            await db.execute(
                select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
            )
        ).scalar_one_or_none()
        if order is not None:
            logger.info("confirm_payment: уже выполнено для order_id=%s", order_id)
            return order

    # Загрузка заказа с блокировкой
    order = (
        await db.execute(
            select(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заказ {order_id} не найден",
        )

    # Идемпотентность: если заказ уже в ESCROW_HELD — вернуть без ошибки
    if order.status == MarketplaceOrderStatus.ESCROW_HELD.value:
        logger.info("confirm_payment: заказ уже в ESCROW_HELD, order_id=%s", order_id)
        return order

    # Проверка допустимого статуса (transition_order выбросит 409 если переход невозможен)
    if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Подтверждение оплаты невозможно: заказ в статусе {order.status}",
        )

    # Переход статуса: PENDING_PAYMENT → ESCROW_HELD
    order = await transition_order(
        db=db,
        order=order,
        target_status=MarketplaceOrderStatus.ESCROW_HELD,
        changed_by=admin_id,
    )

    # Установка подтвердившего администратора
    order.confirmed_by = admin_id

    # Заморозка средств (ledger entry)
    await freeze_funds(
        order_id=order.id,
        amount_kopeks=order.amount_kopeks,
        db=db,
    )

    # Уведомление блогеру о новом заказе в работе
    client = (
        await db.execute(
            select(User).where(User.id == order.client_id)
        )
    ).scalar_one_or_none()
    client_name = client.name if client else "Неизвестный клиент"

    await notify(
        db=db,
        user_id=order.blogger_id,
        event_type="order_confirmed",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "client_name": client_name,
        },
    )

    blogger_user = (
        await db.execute(select(User).where(User.id == order.blogger_id))
    ).scalar_one_or_none()
    if blogger_user is not None:
        telegram_notify_service.notify_user_telegram(
            blogger_user,
            "Заказ оплачен, деньги в эскроу — можно приступать: "
            f"{telegram_notify_service.order_url(order.id)}",
        )

    await db.flush()

    return order


async def process_refund(
    order_id: uuid.UUID,
    admin_id: uuid.UUID,
    reason: str,
    db: AsyncSession,
) -> MarketplaceOrder:
    """Админ оформляет возврат: ESCROW_HELD/BLOGGER_CONFIRMED → REFUNDED.

    Логика:
    1. Загрузка заказа с блокировкой (SELECT FOR UPDATE).
    2. Идемпотентность: если заказ уже в REFUNDED — вернуть без ошибки.
    3. Проверка допустимого статуса (ESCROW_HELD или BLOGGER_CONFIRMED).
    4. Переход статуса через transition_order → REFUNDED.
    5. Установка refunded_at, refund_reason, refunded_by.
    6. Балансы НЕ меняются (средства были заморожены, не распределены).
    7. Уведомления заказчику и блогеру.

    Args:
        order_id: UUID заказа.
        admin_id: UUID администратора, оформляющего возврат.
        reason: Причина возврата (1–1000 символов).
        db: Асинхронная сессия БД.

    Returns:
        Обновлённый объект MarketplaceOrder.

    Raises:
        HTTPException(404): Заказ не найден.
        HTTPException(409): Заказ не в допустимом статусе для возврата.
    """
    from datetime import datetime, timezone

    # Загрузка заказа с блокировкой
    order = (
        await db.execute(
            select(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Заказ {order_id} не найден",
        )

    # Идемпотентность: если заказ уже в REFUNDED — вернуть без ошибки
    if order.status == MarketplaceOrderStatus.REFUNDED.value:
        logger.info("process_refund: заказ уже в REFUNDED, order_id=%s", order_id)
        return order

    # Проверка допустимого статуса
    allowed_statuses = {
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
    }
    if order.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Возврат невозможен: заказ в статусе {order.status}",
        )

    # Переход статуса: → REFUNDED
    order = await transition_order(
        db=db,
        order=order,
        target_status=MarketplaceOrderStatus.REFUNDED,
        changed_by=admin_id,
        reason=reason,
    )

    # Установка полей возврата
    order.refunded_at = datetime.now(timezone.utc)
    order.refund_reason = reason
    order.refunded_by = admin_id

    # Балансы НЕ меняются — средства были заморожены, но не распределены

    # Уведомление заказчику о возврате
    await notify(
        db=db,
        user_id=order.client_id,
        event_type="order_refunded",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "reason": reason,
        },
    )

    # Уведомление блогеру о возврате
    await notify(
        db=db,
        user_id=order.blogger_id,
        event_type="order_refunded",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "reason": reason,
        },
    )

    participants = (
        await db.execute(
            select(User).where(User.id.in_([order.client_id, order.blogger_id]))
        )
    ).scalars().all()
    users_by_id = {u.id: u for u in participants}
    order_link = telegram_notify_service.order_url(order.id)
    reason_text = telegram_notify_service.escape_html(reason)
    client_user = users_by_id.get(order.client_id)
    if client_user is not None:
        telegram_notify_service.notify_user_telegram(
            client_user,
            f"По заказу оформлен возврат {telegram_notify_service.format_rub(order.amount_kopeks)}: "
            f"{reason_text}. Подробности: {order_link}",
        )
    blogger_user = users_by_id.get(order.blogger_id)
    if blogger_user is not None:
        telegram_notify_service.notify_user_telegram(
            blogger_user,
            f"По заказу оформлен возврат средств заказчику: {reason_text}. "
            f"Подробности: {order_link}",
        )

    await db.flush()

    return order


async def distribute_funds(
    order_id: uuid.UUID,
    db: AsyncSession,
) -> DistributionResult:
    """Распределить замороженные средства по заказу.

    Рассчитывает доли по формуле (floor для worker/platform, остаток блогеру),
    создаёт ledger-записи, кредитует marketplace_balance_kopeks участникам.

    Формула:
    - platform_share = floor(amount * platform_pct / 100)
    - worker_share = floor(amount * worker_pct / 100), 0 если нет воркера
    - blogger_share = amount - platform_share - worker_share
    - Инвариант: blogger + worker + platform == amount

    Использует SELECT FOR UPDATE на строке заказа для конкурентной безопасности.
    Идемпотентно: если запись с idempotency_key уже существует — возвращает результат
    без повторного начисления.
    """
    from core.settings import settings

    idempotency_key = f"{order_id}:distribute"

    # Проверка идемпотентности — если distribute уже выполнен, пропускаем
    existing = await db.execute(
        select(MarketplaceEscrowEntry).where(
            MarketplaceEscrowEntry.idempotency_key == idempotency_key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("distribute_funds: уже выполнено для order_id=%s", order_id)
        # Восстановить результат из существующих записей
        entries = (
            await db.execute(
                select(MarketplaceEscrowEntry).where(
                    MarketplaceEscrowEntry.order_id == order_id,
                    MarketplaceEscrowEntry.entry_type.in_(
                        [
                            "release_blogger",
                            "release_worker",
                            "release_blogger_referral",
                            "release_platform",
                        ]
                    ),
                )
            )
        ).scalars().all()
        blogger_share = worker_share = blogger_referral_share = platform_share = 0
        for e in entries:
            if e.entry_type == "release_blogger":
                blogger_share = e.amount_kopeks
            elif e.entry_type == "release_worker":
                worker_share = e.amount_kopeks
            elif e.entry_type == "release_blogger_referral":
                blogger_referral_share = e.amount_kopeks
            elif e.entry_type == "release_platform":
                platform_share = e.amount_kopeks
        return DistributionResult(
            blogger_share=blogger_share,
            worker_share=worker_share,
            blogger_referral_share=blogger_referral_share,
            platform_share=platform_share,
            order_id=order_id,
        )

    # Блокировка строки заказа
    order = (
        await db.execute(
            select(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if order is None:
        raise ValueError(f"Заказ {order_id} не найден")

    # Рассчитать доли — если участник не привязан, его pct = 0 → доля уходит автору
    worker_pct = order.worker_commission_pct if order.worker_id else Decimal("0")
    blogger_ref_pct = (
        order.blogger_referrer_commission_pct if order.blogger_referrer_id else Decimal("0")
    )
    blogger_share, worker_share, blogger_referral_share, platform_share = calculate_distribution(
        amount_kopeks=order.amount_kopeks,
        platform_commission_pct=order.platform_commission_pct,
        worker_commission_pct=worker_pct,
        blogger_referrer_commission_pct=blogger_ref_pct,
    )

    platform_user_id = settings.platform_revenue_user_id

    # Создать ledger-записи для каждого получателя
    # Запись блогера — используется как маркер идемпотентности (основной ключ)
    db.add(
        MarketplaceEscrowEntry(
            order_id=order_id,
            user_id=order.blogger_id,
            entry_type="release_blogger",
            amount_kopeks=blogger_share,
            note="Доля блогера по заказу",
            idempotency_key=idempotency_key,
        )
    )

    # Запись воркера (только если есть комиссия и воркер привязан)
    if worker_share > 0 and order.worker_id:
        db.add(
            MarketplaceEscrowEntry(
                order_id=order_id,
                user_id=order.worker_id,
                entry_type="release_worker",
                amount_kopeks=worker_share,
                note="Реферальная комиссия воркера",
                idempotency_key=f"{order_id}:release_worker",
            )
        )

    # Запись блогера-реферера, 2-й уровень (только если есть комиссия и реферер привязан)
    if blogger_referral_share > 0 and order.blogger_referrer_id:
        db.add(
            MarketplaceEscrowEntry(
                order_id=order_id,
                user_id=order.blogger_referrer_id,
                entry_type="release_blogger_referral",
                amount_kopeks=blogger_referral_share,
                note="Реферальная комиссия блогера (2-й уровень)",
                idempotency_key=f"{order_id}:release_blogger_referral",
            )
        )

    # Запись платформы — user_id = platform_revenue_user_id
    db.add(
        MarketplaceEscrowEntry(
            order_id=order_id,
            user_id=platform_user_id,
            entry_type="release_platform",
            amount_kopeks=platform_share,
            note="Комиссия платформы",
            idempotency_key=f"{order_id}:release_platform",
        )
    )

    # Кредитовать балансы участников
    # Блогер
    blogger_user = (
        await db.execute(
            select(User).where(User.id == order.blogger_id).with_for_update()
        )
    ).scalar_one_or_none()
    if blogger_user is not None:
        blogger_user.marketplace_balance_kopeks += blogger_share

    # Воркер (если есть комиссия)
    if worker_share > 0 and order.worker_id:
        worker_user = (
            await db.execute(
                select(User).where(User.id == order.worker_id).with_for_update()
            )
        ).scalar_one_or_none()
        if worker_user is not None:
            worker_user.marketplace_balance_kopeks += worker_share

    # Блогер-реферер, 2-й уровень (если есть комиссия)
    if blogger_referral_share > 0 and order.blogger_referrer_id:
        blogger_ref_user = (
            await db.execute(
                select(User).where(User.id == order.blogger_referrer_id).with_for_update()
            )
        ).scalar_one_or_none()
        if blogger_ref_user is not None:
            blogger_ref_user.marketplace_balance_kopeks += blogger_referral_share

    # Платформа — кредитовать системного пользователя
    platform_user = (
        await db.execute(
            select(User).where(User.id == platform_user_id).with_for_update()
        )
    ).scalar_one_or_none()
    if platform_user is not None:
        platform_user.marketplace_balance_kopeks += platform_share

    await db.flush()

    return DistributionResult(
        blogger_share=blogger_share,
        worker_share=worker_share,
        blogger_referral_share=blogger_referral_share,
        platform_share=platform_share,
        order_id=order_id,
    )


async def refund_to_client(
    order_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Вернуть замороженные средства клиенту.

    Создаёт ledger-запись типа 'refund' и инициирует возврат через YooKassa.
    Использует SELECT FOR UPDATE на строке заказа для конкурентной безопасности.
    Идемпотентно: если запись возврата уже существует — пропускает.
    """
    idempotency_key = f"{order_id}:refund"

    # Проверка идемпотентности
    existing = await db.execute(
        select(MarketplaceEscrowEntry).where(
            MarketplaceEscrowEntry.idempotency_key == idempotency_key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        logger.info("refund_to_client: уже выполнено для order_id=%s", order_id)
        return

    # Блокировка строки заказа
    order = (
        await db.execute(
            select(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if order is None:
        raise ValueError(f"Заказ {order_id} не найден")

    # Создать запись возврата
    entry = MarketplaceEscrowEntry(
        order_id=order_id,
        user_id=order.client_id,
        entry_type="refund",
        amount_kopeks=order.amount_kopeks,
        note="Возврат средств клиенту",
        idempotency_key=idempotency_key,
    )
    db.add(entry)

    # Инициировать возврат через YooKassa (если есть payment_id)
    if order.yookassa_payment_id:
        try:
            from services.marketplace_payment_service import create_refund

            await create_refund(
                payment_id=order.yookassa_payment_id,
                amount_kopeks=order.amount_kopeks,
                order_id=order_id,
                db=db,
            )
        except Exception:
            logger.exception(
                "refund_to_client: ошибка возврата через YooKassa для order_id=%s",
                order_id,
            )
            # Запись в ledger всё равно создаётся — возврат будет обработан вручную
            # или через повторную попытку

    await db.flush()
