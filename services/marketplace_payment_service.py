"""PaymentService — приём платежей и выплаты для маркетплейса блогеров.

Использует YooKassa Payment API v3 для приёма оплат от заказчиков
и существующий yookassa_payout_client для выплат блогерам/воркерам.
"""

from __future__ import annotations

import base64
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.marketplace import MarketplaceOrderStatus, WithdrawalStatus
from models.marketplace_order import MarketplaceOrder
from models.marketplace_withdrawal import MarketplaceWithdrawal
from models.user import User

logger = logging.getLogger(__name__)

YOOKASSA_PAYMENTS_URL = "https://api.yookassa.ru/v3/payments"
YOOKASSA_REFUNDS_URL = "https://api.yookassa.ru/v3/refunds"
PAYMENT_EXPIRATION_MINUTES = 60


class PaymentServiceError(Exception):
    """Ошибка при работе с платёжным сервисом."""


@dataclass
class PaymentResult:
    """Результат создания платежа."""

    payment_id: str
    payment_url: str
    expires_at: datetime


@dataclass
class PayoutResult:
    """Результат создания выплаты."""

    payout_id: str
    status: str


def _kopeks_to_amount_str(kopeks: int) -> str:
    """Конвертирует копейки в строку суммы для YooKassa (напр. 10050 -> '100.50')."""
    q = Decimal(kopeks) / Decimal(100)
    return f"{q:.2f}"


def _get_auth_header(shop_id: str, secret: str) -> str:
    """Формирует Basic Auth заголовок из shop_id и secret_key."""
    token = base64.b64encode(f"{shop_id.strip()}:{secret.strip()}".encode()).decode()
    return f"Basic {token}"


async def _effective_credentials(db: AsyncSession):
    """Ключи ЮKassa: настройки из админки (БД) приоритетнее ENV."""
    from services.marketplace_payment_settings_service import get_effective_yookassa

    return await get_effective_yookassa(db)


async def create_refund(
    payment_id: str,
    amount_kopeks: int,
    order_id: uuid.UUID,
    *,
    db: AsyncSession,
) -> str | None:
    """
    Создаёт возврат платежа через YooKassa Refunds API.

    Args:
        payment_id: ID платежа YooKassa для возврата.
        amount_kopeks: Сумма возврата в копейках.
        order_id: ID заказа (для метаданных).
        db: Сессия БД (для чтения ключей из настроек админки).

    Returns:
        refund_id или None при ошибке.
    """
    creds = await _effective_credentials(db)
    if not creds.active:
        raise PaymentServiceError("YooKassa не настроена")

    refund_url = YOOKASSA_REFUNDS_URL
    idempotency_key = f"{order_id}:refund"

    payload: dict[str, Any] = {
        "payment_id": payment_id,
        "amount": {
            "value": _kopeks_to_amount_str(amount_kopeks),
            "currency": "RUB",
        },
        "description": f"Возврат по заказу маркетплейса {order_id}",
    }

    headers = {
        "Authorization": _get_auth_header(creds.shop_id, creds.secret_key),
        "Content-Type": "application/json",
        "Idempotence-Key": idempotency_key,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(refund_url, json=payload, headers=headers)

    try:
        body = response.json()
    except Exception:
        body = {}

    if not response.is_success:
        msg = body.get("description") or body.get("type") or response.text
        logger.warning("YooKassa refund failed: %s %s", response.status_code, msg)
        raise PaymentServiceError(f"Ошибка возврата: {msg}")

    return body.get("id")


class PaymentService:
    """Сервис платежей маркетплейса: приём оплат и выплаты."""

    # ------------------------------------------------------------------
    # Payment creation (incoming payments from clients)
    # ------------------------------------------------------------------

    @staticmethod
    async def create_payment(
        order_id: uuid.UUID,
        amount_kopeks: int,
        return_url: str,
        *,
        customer_email: str,
        db: AsyncSession,
    ) -> PaymentResult:
        """
        Создаёт платёж в YooKassa Payment API v3 и сохраняет payment_id на заказе.

        Args:
            order_id: ID заказа маркетплейса.
            amount_kopeks: Сумма в копейках.
            return_url: URL для возврата клиента после оплаты.
            customer_email: E-mail плательщика для фискального чека (54-ФЗ).
            db: Сессия БД.

        Returns:
            PaymentResult с payment_id, payment_url и expires_at.

        Raises:
            PaymentServiceError: если YooKassa вернула ошибку или заказ не найден.
        """
        creds = await _effective_credentials(db)
        if not creds.active:
            raise PaymentServiceError("YooKassa платежи не настроены")

        # Verify order exists and is in correct status
        result = await db.execute(
            select(MarketplaceOrder).where(MarketplaceOrder.id == order_id),
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise PaymentServiceError(f"Заказ {order_id} не найден")
        if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
            raise PaymentServiceError(
                f"Заказ {order_id} в статусе {order.status}, ожидается PENDING_PAYMENT"
            )

        email = (customer_email or "").strip()
        if not email:
            raise PaymentServiceError(
                "Для оплаты нужен e-mail плательщика (фискальный чек 54-ФЗ)"
            )

        expires_at = datetime.now(timezone.utc) + timedelta(minutes=PAYMENT_EXPIRATION_MINUTES)
        idempotency_key = str(uuid.uuid4())
        amount_value = _kopeks_to_amount_str(amount_kopeks)
        description = f"Оплата заказа маркетплейса {order_id}"

        payload: dict[str, Any] = {
            "amount": {
                "value": amount_value,
                "currency": "RUB",
            },
            "confirmation": {
                "type": "redirect",
                "return_url": return_url,
            },
            "capture": True,
            "description": description,
            # Чек 54-ФЗ: ЮKassa с включённой фискализацией отклоняет платёж
            # без receipt ("Receipt is missing or illegal").
            "receipt": {
                "customer": {"email": email},
                "items": [
                    {
                        "description": description[:128],
                        "quantity": "1.00",
                        "amount": {"value": amount_value, "currency": "RUB"},
                        "vat_code": settings.yukassa_vat_code,
                        "payment_mode": "full_payment",
                        "payment_subject": "service",
                    }
                ],
            },
            "metadata": {
                "order_id": str(order_id),
                "type": "marketplace",
            },
            "expires_at": expires_at.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        }

        headers = {
            "Authorization": _get_auth_header(creds.shop_id, creds.secret_key),
            "Content-Type": "application/json",
            "Idempotence-Key": idempotency_key,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(YOOKASSA_PAYMENTS_URL, json=payload, headers=headers)

        try:
            body = response.json()
        except Exception:
            body = {}

        if not response.is_success:
            msg = (
                body.get("description")
                or body.get("type")
                or response.text
                or response.reason_phrase
            )
            logger.warning(
                "YooKassa create payment failed: %s %s", response.status_code, msg
            )
            # НЕ роняем заказ в PAYMENT_FAILED: ошибка *создания* платежа
            # (конфиг ЮKassa, чек 54-ФЗ, сеть) не должна делать сделку
            # терминальной. Заказ остаётся PENDING_PAYMENT — клиент видит
            # ошибку и может повторить «Оплатить онлайн».
            raise PaymentServiceError(f"Ошибка создания платежа: {msg}")

        payment_id = body.get("id")
        confirmation = body.get("confirmation", {})
        confirmation_url = confirmation.get("confirmation_url", "")

        if not payment_id or not confirmation_url:
            logger.warning("YooKassa unexpected payment body: %s", body)
            raise PaymentServiceError("Некорректный ответ YooKassa")

        # Store payment info on order
        await db.execute(
            update(MarketplaceOrder)
            .where(MarketplaceOrder.id == order_id)
            .values(
                yookassa_payment_id=str(payment_id),
                payment_url=confirmation_url,
                payment_expires_at=expires_at,
            )
        )
        await db.commit()

        return PaymentResult(
            payment_id=str(payment_id),
            payment_url=confirmation_url,
            expires_at=expires_at,
        )

    # ------------------------------------------------------------------
    # Payment webhook handling
    # ------------------------------------------------------------------

    @staticmethod
    async def handle_payment_webhook(event: dict[str, Any], *, db: AsyncSession) -> None:
        """
        Обрабатывает вебхуки платежей от YooKassa.

        Поддерживаемые события:
        - payment.succeeded: замораживает средства, обновляет статус на ESCROW_HELD
        - payment.canceled: обновляет статус на PAYMENT_FAILED

        Идемпотентность: проверяет текущий статус заказа перед обработкой.
        """
        event_type = event.get("event")
        obj = event.get("object")
        if not isinstance(obj, dict):
            logger.debug("Payment webhook: missing object in event")
            return

        payment_id = obj.get("id")
        if not payment_id:
            logger.debug("Payment webhook: missing payment id")
            return

        metadata = obj.get("metadata", {})
        order_id_str = metadata.get("order_id")
        event_metadata_type = metadata.get("type")

        # Only process marketplace payments
        if event_metadata_type != "marketplace":
            return

        if not order_id_str:
            logger.warning("Payment webhook: missing order_id in metadata, payment_id=%s", payment_id)
            return

        try:
            order_id = uuid.UUID(order_id_str)
        except (ValueError, TypeError):
            logger.warning("Payment webhook: invalid order_id=%s", order_id_str)
            return

        # Find order by payment_id for idempotency check
        result = await db.execute(
            select(MarketplaceOrder).where(MarketplaceOrder.id == order_id),
        )
        order = result.scalar_one_or_none()
        if order is None:
            logger.warning("Payment webhook: order %s not found", order_id)
            return

        if event_type == "payment.succeeded":
            await PaymentService._handle_payment_succeeded(order, payment_id, db=db)
        elif event_type == "payment.canceled":
            await PaymentService._handle_payment_canceled(order, db=db)
        else:
            logger.debug("Payment webhook: unhandled event type %s", event_type)

    @staticmethod
    async def _handle_payment_succeeded(
        order: MarketplaceOrder,
        payment_id: str,
        *,
        db: AsyncSession,
    ) -> None:
        """Обработка успешного платежа: заморозка средств и обновление статуса."""
        # Idempotency: skip if already processed
        if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
            logger.info(
                "Payment webhook: order %s already in status %s, skipping payment.succeeded",
                order.id,
                order.status,
            )
            return

        # Import here to avoid circular imports
        from services.marketplace_escrow_service import freeze_funds
        from services.notification_service import notify

        # Freeze funds via escrow service
        await freeze_funds(order_id=order.id, amount_kopeks=order.amount_kopeks, db=db)

        # Update order status to ESCROW_HELD
        await db.execute(
            update(MarketplaceOrder)
            .where(
                MarketplaceOrder.id == order.id,
                MarketplaceOrder.status == MarketplaceOrderStatus.PENDING_PAYMENT.value,
            )
            .values(
                status=MarketplaceOrderStatus.ESCROW_HELD.value,
                yookassa_payment_id=str(payment_id),
                paid_at=datetime.now(timezone.utc),
            )
        )

        # Уведомление блогеру — как при админ-подтверждении оплаты
        client = (
            await db.execute(select(User).where(User.id == order.client_id))
        ).scalar_one_or_none()
        await notify(
            db=db,
            user_id=order.blogger_id,
            event_type="order_confirmed",
            payload={
                "order_id": str(order.id),
                "amount": order.amount_kopeks,
                "client_name": client.name if client else "Неизвестный клиент",
            },
        )

        await db.commit()

        logger.info("Payment succeeded: order %s → ESCROW_HELD", order.id)

    @staticmethod
    async def _handle_payment_canceled(
        order: MarketplaceOrder,
        *,
        db: AsyncSession,
    ) -> None:
        """Обработка отменённого/просроченного платежа."""
        # Idempotency: skip if already processed
        if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
            logger.info(
                "Payment webhook: order %s already in status %s, skipping payment.canceled",
                order.id,
                order.status,
            )
            return

        await db.execute(
            update(MarketplaceOrder)
            .where(
                MarketplaceOrder.id == order.id,
                MarketplaceOrder.status == MarketplaceOrderStatus.PENDING_PAYMENT.value,
            )
            .values(status=MarketplaceOrderStatus.PAYMENT_FAILED.value)
        )
        await db.commit()

        logger.info("Payment canceled: order %s → PAYMENT_FAILED", order.id)

    # ------------------------------------------------------------------
    # Payment status sync (fallback, если вебхук не дошёл)
    # ------------------------------------------------------------------

    @staticmethod
    async def sync_payment_status(order: MarketplaceOrder, *, db: AsyncSession) -> bool:
        """
        Сверяет статус платежа напрямую с YooKassa и применяет переход.

        Вебхук может не дойти (не зарегистрирован в кабинете, сеть, 403) —
        тогда заказ навсегда зависает в PENDING_PAYMENT, хотя деньги списаны.
        Этот метод опрашивает GET /v3/payments/{id} и выполняет ту же
        обработку, что и вебхук. Ошибки сети/YooKassa не пробрасываются:
        сверка — best-effort, страница заказа не должна падать из-за неё.

        Returns:
            True, если статус заказа изменился.
        """
        if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
            return False
        payment_id = order.yookassa_payment_id
        if not payment_id:
            return False

        creds = await _effective_credentials(db)
        if not creds.active:
            return False

        headers = {"Authorization": _get_auth_header(creds.shop_id, creds.secret_key)}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{YOOKASSA_PAYMENTS_URL}/{payment_id}", headers=headers
                )
            body = response.json()
        except Exception as exc:
            logger.warning("YooKassa payment sync failed for order %s: %s", order.id, exc)
            return False

        if not response.is_success or not isinstance(body, dict):
            logger.warning(
                "YooKassa payment sync %s: HTTP %s %s",
                payment_id,
                response.status_code,
                body,
            )
            return False

        payment_status = body.get("status")
        if payment_status == "succeeded":
            await PaymentService._handle_payment_succeeded(order, payment_id, db=db)
            return True
        if payment_status == "canceled":
            await PaymentService._handle_payment_canceled(order, db=db)
            return True
        # pending / waiting_for_capture — платёж ещё не завершён
        return False

    # ------------------------------------------------------------------
    # Payout creation (outgoing payouts to bloggers/workers)
    # ------------------------------------------------------------------

    @staticmethod
    async def create_payout(
        user_id: uuid.UUID,
        amount_kopeks: int,
        payout_token: str,
        *,
        db: AsyncSession,
        withdrawal_id: uuid.UUID | None = None,
    ) -> PayoutResult:
        """
        Создаёт выплату через YooKassa Payout API (существующий паттерн).

        Args:
            user_id: ID пользователя-получателя.
            amount_kopeks: Сумма выплаты в копейках.
            payout_token: Токен карты получателя (из виджета YooKassa).
            db: Сессия БД.
            withdrawal_id: ID записи withdrawal (если есть).

        Returns:
            PayoutResult с payout_id и status.

        Raises:
            PaymentServiceError: если выплата не удалась.
        """
        from services.yookassa_payout_client import (
            YookassaPayoutError,
            create_payout as yookassa_create_payout,
            new_idempotency_key,
        )

        idempotency_key = new_idempotency_key()
        metadata: dict[str, str] = {
            "user_id": str(user_id),
            "type": "marketplace_withdrawal",
        }
        if withdrawal_id:
            metadata["withdrawal_id"] = str(withdrawal_id)

        creds = await _effective_credentials(db)
        if not creds.active:
            raise PaymentServiceError("ЮKassa выплаты не настроены")

        try:
            payout_id, status = await yookassa_create_payout(
                amount_kopeks=amount_kopeks,
                payout_token=payout_token,
                description=f"Выплата маркетплейс пользователю {user_id}",
                metadata=metadata,
                idempotency_key=idempotency_key,
                shop_id=creds.shop_id,
                secret_key=creds.secret_key,
            )
        except YookassaPayoutError as exc:
            logger.warning("Marketplace payout failed for user %s: %s", user_id, exc)
            # Update withdrawal status to FAILED if we have a withdrawal_id
            if withdrawal_id:
                await db.execute(
                    update(MarketplaceWithdrawal)
                    .where(MarketplaceWithdrawal.id == withdrawal_id)
                    .values(
                        status=WithdrawalStatus.FAILED.value,
                        error_message=str(exc)[:500],
                    )
                )
                # Restore balance
                await db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(
                        marketplace_balance_kopeks=User.marketplace_balance_kopeks + amount_kopeks,
                    )
                )
                await db.commit()
            raise PaymentServiceError(f"Ошибка выплаты: {exc}") from exc

        # Store payout_id on withdrawal record
        if withdrawal_id:
            await db.execute(
                update(MarketplaceWithdrawal)
                .where(MarketplaceWithdrawal.id == withdrawal_id)
                .values(yookassa_payout_id=payout_id)
            )
            await db.commit()

        return PayoutResult(payout_id=payout_id, status=status)

    # ------------------------------------------------------------------
    # Payout webhook handling
    # ------------------------------------------------------------------

    @staticmethod
    async def handle_payout_webhook(event: dict[str, Any], *, db: AsyncSession) -> None:
        """
        Обрабатывает вебхуки выплат от YooKassa.

        Поддерживаемые события:
        - payout.succeeded: обновляет withdrawal на COMPLETED
        - payout.canceled: обновляет withdrawal на FAILED, восстанавливает баланс

        Идемпотентность: проверяет текущий статус withdrawal перед обработкой.
        """
        event_type = event.get("event")
        obj = event.get("object")
        if not isinstance(obj, dict):
            logger.debug("Payout webhook: missing object in event")
            return

        payout_id = obj.get("id")
        if not payout_id:
            logger.debug("Payout webhook: missing payout id")
            return

        metadata = obj.get("metadata", {})
        payout_type = metadata.get("type")

        # Only process marketplace withdrawal payouts
        if payout_type != "marketplace_withdrawal":
            return

        # Find withdrawal by payout_id
        result = await db.execute(
            select(MarketplaceWithdrawal).where(
                MarketplaceWithdrawal.yookassa_payout_id == str(payout_id)
            ),
        )
        withdrawal = result.scalar_one_or_none()
        if withdrawal is None:
            logger.warning("Payout webhook: withdrawal not found for payout_id=%s", payout_id)
            return

        if event_type == "payout.succeeded":
            await PaymentService._handle_payout_succeeded(withdrawal, db=db)
        elif event_type in ("payout.canceled", "payout.failed"):
            await PaymentService._handle_payout_canceled(withdrawal, db=db)
        else:
            logger.debug("Payout webhook: unhandled event type %s", event_type)

    @staticmethod
    async def _handle_payout_succeeded(
        withdrawal: MarketplaceWithdrawal,
        *,
        db: AsyncSession,
    ) -> None:
        """Обработка успешной выплаты: обновление статуса на COMPLETED."""
        # Idempotency: skip if already processed
        if withdrawal.status != WithdrawalStatus.PENDING.value:
            logger.info(
                "Payout webhook: withdrawal %s already in status %s, skipping payout.succeeded",
                withdrawal.id,
                withdrawal.status,
            )
            return

        await db.execute(
            update(MarketplaceWithdrawal)
            .where(
                MarketplaceWithdrawal.id == withdrawal.id,
                MarketplaceWithdrawal.status == WithdrawalStatus.PENDING.value,
            )
            .values(
                status=WithdrawalStatus.COMPLETED.value,
                completed_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

        logger.info("Payout succeeded: withdrawal %s → COMPLETED", withdrawal.id)

    @staticmethod
    async def _handle_payout_canceled(
        withdrawal: MarketplaceWithdrawal,
        *,
        db: AsyncSession,
    ) -> None:
        """Обработка отменённой выплаты: FAILED + восстановление баланса."""
        # Idempotency: skip if already processed
        if withdrawal.status != WithdrawalStatus.PENDING.value:
            logger.info(
                "Payout webhook: withdrawal %s already in status %s, skipping payout.canceled",
                withdrawal.id,
                withdrawal.status,
            )
            return

        # Update withdrawal status to FAILED
        await db.execute(
            update(MarketplaceWithdrawal)
            .where(
                MarketplaceWithdrawal.id == withdrawal.id,
                MarketplaceWithdrawal.status == WithdrawalStatus.PENDING.value,
            )
            .values(
                status=WithdrawalStatus.FAILED.value,
                error_message="Выплата отменена YooKassa",
            )
        )

        # Restore balance to user
        await db.execute(
            update(User)
            .where(User.id == withdrawal.user_id)
            .values(
                marketplace_balance_kopeks=User.marketplace_balance_kopeks + withdrawal.amount_kopeks,
            )
        )
        await db.commit()

        logger.info(
            "Payout canceled: withdrawal %s → FAILED, restored %d kopeks to user %s",
            withdrawal.id,
            withdrawal.amount_kopeks,
            withdrawal.user_id,
        )
