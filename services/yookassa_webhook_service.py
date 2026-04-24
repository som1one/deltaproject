"""Обработка исходящих уведомлений ЮKassa по выплатам."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.ledger import LedgerEntryStatus
from models.ledger_entry import LedgerEntry
from services.ledger_service import apply_yukassa_payout_finished

logger = logging.getLogger(__name__)


async def handle_yukassa_notification(body: dict[str, Any], db: AsyncSession) -> None:
    """
    Разбор тела уведомления (см. документацию «Исходящие уведомления»).

    Ожидаем object.type == payout и event payout.succeeded / payout.canceled.
    """
    if body.get("type") != "notification":
        return
    event = body.get("event")
    if not isinstance(event, str) or not event.startswith("payout."):
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
