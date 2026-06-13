"""Escrow-сервис маркетплейса блогеров.

Отвечает за замораживание, распределение и возврат средств по заказам.
Все суммы — в копейках (целочисленная арифметика, без float).
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_order import MarketplaceOrder
from models.user import User

logger = logging.getLogger(__name__)


@dataclass
class DistributionResult:
    """Результат распределения средств по заказу."""

    blogger_share: int
    worker_share: int
    platform_share: int
    order_id: uuid.UUID


def calculate_distribution(
    amount_kopeks: int,
    platform_commission_pct: Decimal,
    worker_commission_pct: Decimal,
) -> tuple[int, int, int]:
    """Рассчитать распределение средств.

    Returns:
        (blogger_share, worker_share, platform_share) — все в копейках.

    Правила:
    - platform_share = floor(amount * platform_pct / 100)
    - worker_share = floor(amount * worker_pct / 100), 0 если нет реферала
    - blogger_share = amount - platform_share - worker_share (остаток блогеру)
    - Инвариант: blogger_share + worker_share + platform_share == amount
    """
    # Используем Decimal для точного вычисления, затем floor → int
    platform_share = int((Decimal(amount_kopeks) * platform_commission_pct / Decimal(100)).to_integral_value(rounding="ROUND_FLOOR"))
    worker_share = int((Decimal(amount_kopeks) * worker_commission_pct / Decimal(100)).to_integral_value(rounding="ROUND_FLOOR"))
    blogger_share = amount_kopeks - platform_share - worker_share
    return blogger_share, worker_share, platform_share


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


async def distribute_funds(
    order_id: uuid.UUID,
    db: AsyncSession,
) -> DistributionResult:
    """Распределить замороженные средства по заказу.

    Рассчитывает доли по формуле (floor для worker/platform, остаток блогеру),
    создаёт ledger-записи, кредитует marketplace_balance_kopeks участникам.

    Использует SELECT FOR UPDATE на строке заказа для конкурентной безопасности.
    Идемпотентно: если записи распределения уже существуют — возвращает результат
    без повторного начисления.
    """
    idempotency_key_blogger = f"{order_id}:release_blogger"

    # Проверка идемпотентности — если блогерская запись уже есть, распределение выполнено
    existing = await db.execute(
        select(MarketplaceEscrowEntry).where(
            MarketplaceEscrowEntry.idempotency_key == idempotency_key_blogger,
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
                        ["release_blogger", "release_worker", "release_platform"]
                    ),
                )
            )
        ).scalars().all()
        blogger_share = worker_share = platform_share = 0
        for e in entries:
            if e.entry_type == "release_blogger":
                blogger_share = e.amount_kopeks
            elif e.entry_type == "release_worker":
                worker_share = e.amount_kopeks
            elif e.entry_type == "release_platform":
                platform_share = e.amount_kopeks
        return DistributionResult(
            blogger_share=blogger_share,
            worker_share=worker_share,
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

    # Рассчитать доли
    worker_pct = order.worker_commission_pct if order.worker_id else Decimal("0")
    blogger_share, worker_share, platform_share = calculate_distribution(
        amount_kopeks=order.amount_kopeks,
        platform_commission_pct=order.platform_commission_pct,
        worker_commission_pct=worker_pct,
    )

    # Создать ledger-записи
    db.add(
        MarketplaceEscrowEntry(
            order_id=order_id,
            user_id=order.blogger_id,
            entry_type="release_blogger",
            amount_kopeks=blogger_share,
            note="Доля блогера по заказу",
            idempotency_key=idempotency_key_blogger,
        )
    )

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

    db.add(
        MarketplaceEscrowEntry(
            order_id=order_id,
            user_id=order.client_id,  # platform entry attributed to client (source)
            entry_type="release_platform",
            amount_kopeks=platform_share,
            note="Комиссия платформы",
            idempotency_key=f"{order_id}:release_platform",
        )
    )

    # Кредитовать балансы участников
    blogger_user = (
        await db.execute(
            select(User).where(User.id == order.blogger_id).with_for_update()
        )
    ).scalar_one_or_none()
    if blogger_user is not None:
        blogger_user.marketplace_balance_kopeks += blogger_share

    if worker_share > 0 and order.worker_id:
        worker_user = (
            await db.execute(
                select(User).where(User.id == order.worker_id).with_for_update()
            )
        ).scalar_one_or_none()
        if worker_user is not None:
            worker_user.marketplace_balance_kopeks += worker_share

    await db.flush()

    return DistributionResult(
        blogger_share=blogger_share,
        worker_share=worker_share,
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
            )
        except Exception:
            logger.exception(
                "refund_to_client: ошибка возврата через YooKassa для order_id=%s",
                order_id,
            )
            # Запись в ledger всё равно создаётся — возврат будет обработан вручную
            # или через повторную попытку

    await db.flush()
