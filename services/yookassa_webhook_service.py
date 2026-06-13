"""Обработка исходящих уведомлений ЮKassa по выплатам и платежам маркетплейса."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.ledger import LedgerEntryStatus
from models.ledger_entry import LedgerEntry
from services.ledger_service import apply_yukassa_payout_finished

logger = logging.getLogger(__name__)


def _is_marketplace_payment_event(body: dict[str, Any]) -> bool:
    """Check if the webhook event is a marketplace payment event."""
    obj = body.get("object")
    if not isinstance(obj, dict):
        return False
    metadata = obj.get("metadata", {})
    return metadata.get("type") == "marketplace"


def _is_marketplace_payout_event(body: dict[str, Any]) -> bool:
    """Check if the webhook event is a marketplace withdrawal payout event."""
    obj = body.get("object")
    if not isinstance(obj, dict):
        return False
    metadata = obj.get("metadata", {})
    return metadata.get("type") == "marketplace_withdrawal"


async def handle_yukassa_notification(body: dict[str, Any], db: AsyncSession) -> None:
    """
    Разбор тела уведомления (см. документацию «Исходящие уведомления»).

    Обрабатывает:
    - Marketplace payment events (payment.succeeded, payment.canceled)
    - Marketplace payout events (payout.succeeded, payout.canceled)
    - Legacy payout events (payout.succeeded / payout.canceled для ledger)
    """
    if body.get("type") != "notification":
        return
    event = body.get("event")
    if not isinstance(event, str):
        return

    # Route marketplace payment events (payment.succeeded, payment.canceled)
    if event.startswith("payment.") and _is_marketplace_payment_event(body):
        await _handle_marketplace_payment_event(body, db)
        return

    # Route marketplace payout events (payout.succeeded, payout.canceled)
    if event.startswith("payout.") and _is_marketplace_payout_event(body):
        await _handle_marketplace_payout_event(body, db)
        return

    # Legacy payout handling (existing ledger-based payouts)
    if not event.startswith("payout."):
        return

    obj = body.get("object")
    if not isinstance(obj, dict):
        return

    payout_id = obj.get("id")
    status = obj.get("status")
    if not payout_id or not status:
        return

    result = await db.execute(
        select(LedgerEntry).where(LedgerEntry.yookassa_payout_id == str(payout_id)),
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        logger.info("ЮKassa webhook: выплата %s не сопоставлена с ledger", payout_id)
        return

    if event == "payout.succeeded" or status == "succeeded":
        await apply_yukassa_payout_finished(entry.id, success=True, db=db, note="yookassa: succeeded")
        return

    if event in ("payout.canceled",) or status in ("canceled", "cancelled"):
        await apply_yukassa_payout_finished(entry.id, success=False, db=db, note="yookassa: canceled")
        return

    if status == "failed" or event == "payout.failed":
        await apply_yukassa_payout_finished(entry.id, success=False, db=db, note="yookassa: failed")
        return

    logger.debug("ЮKassa webhook ignored: event=%s status=%s", event, status)


async def _handle_marketplace_payment_event(body: dict[str, Any], db: AsyncSession) -> None:
    """Route marketplace payment webhook to PaymentService."""
    from services.marketplace_payment_service import PaymentService

    await PaymentService.handle_payment_webhook(body, db=db)


async def _handle_marketplace_payout_event(body: dict[str, Any], db: AsyncSession) -> None:
    """Route marketplace payout webhook to PaymentService."""
    from services.marketplace_payment_service import PaymentService

    await PaymentService.handle_payout_webhook(body, db=db)
