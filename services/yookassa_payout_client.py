"""HTTP-клиент создания выплаты в ЮKassa (API v3)."""

from __future__ import annotations

import base64
import logging
import uuid
from decimal import Decimal
from typing import Any

import httpx

from core.settings import settings

logger = logging.getLogger(__name__)

YOOKASSA_PAYOUTS_URL = "https://api.yookassa.ru/v3/payouts"


class YookassaPayoutError(Exception):
    """Ошибка ответа API ЮKassa при создании выплаты."""


def _kopeks_to_amount_str(kopeks: int) -> str:
    q = Decimal(kopeks) / Decimal(100)
    return format(q, "f")


async def create_payout(
    *,
    amount_kopeks: int,
    payout_token: str,
    description: str,
    metadata: dict[str, str],
    idempotency_key: str,
) -> tuple[str, str]:
    """
    Создаёт выплату.

    Returns:
        (payout_id, status) — status из ответа ЮKassa, например pending / succeeded.
    """
    if not settings.yukassa_payout_active:
        raise YookassaPayoutError("ЮKassa выплаты не настроены")

    shop_id = settings.yukassa_payout_shop_id.strip()
    secret = settings.yukassa_payout_secret_key.strip()
    token = base64.b64encode(f"{shop_id}:{secret}".encode()).decode()

    payload: dict[str, Any] = {
        "amount": {"value": _kopeks_to_amount_str(amount_kopeks), "currency": "RUB"},
        "payout_token": payout_token.strip(),
        "description": description[:128],
        "metadata": metadata,
    }

    headers = {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key[:64],
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(YOOKASSA_PAYOUTS_URL, json=payload, headers=headers)

    try:
        body = response.json()
    except Exception:
        body = {}

    if not response.is_success:
        msg = body.get("description") or body.get("type") or response.text or response.reason_phrase
        logger.warning("ЮKassa create payout failed: %s %s", response.status_code, msg)
        raise YookassaPayoutError(str(msg))

    payout_id = body.get("id")
    status = body.get("status")
    if not payout_id or not status:
        logger.warning("ЮKassa unexpected body: %s", body)
        raise YookassaPayoutError("Некорректный ответ ЮKassa")

    return str(payout_id), str(status)


def new_idempotency_key() -> str:
    return str(uuid.uuid4())
