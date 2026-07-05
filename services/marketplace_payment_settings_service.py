"""Сервис настроек приёма оплаты маркетплейса (singleton, id=1).

Реквизиты карты админа + ключи ЮKassa. Ключи из БД имеют приоритет
над ENV (`YUKASSA_PAYOUT_*`) — ENV остаётся fallback'ом.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models.marketplace_payment_settings import MarketplacePaymentSettings
from schemas.marketplace_payment_settings import (
    CardRequisitesPublic,
    PaymentSettingsResponse,
    PaymentSettingsUpsert,
)

logger = logging.getLogger(__name__)

_SINGLETON_ID = 1


@dataclass(frozen=True)
class YookassaCredentials:
    enabled: bool
    shop_id: str
    secret_key: str

    @property
    def active(self) -> bool:
        return self.enabled and bool(self.shop_id) and bool(self.secret_key)


async def get_payment_settings(db: AsyncSession) -> MarketplacePaymentSettings | None:
    result = await db.execute(
        select(MarketplacePaymentSettings).where(MarketplacePaymentSettings.id == _SINGLETON_ID)
    )
    return result.scalar_one_or_none()


async def upsert_payment_settings(
    db: AsyncSession,
    data: PaymentSettingsUpsert,
    admin_id: uuid.UUID,
) -> MarketplacePaymentSettings:
    """Upsert singleton-настроек. Для yookassa_secret_key: None — не менять, '' — очистить."""
    current = await get_payment_settings(db)

    def norm(value: str | None) -> str | None:
        """'' -> None (очистить), None -> None, иначе строка."""
        if value is None:
            return None
        value = value.strip()
        return value or None

    if data.yookassa_secret_key is None:
        secret = current.yookassa_secret_key if current is not None else None
    else:
        secret = norm(data.yookassa_secret_key)

    values = {
        "id": _SINGLETON_ID,
        "card_number": norm(data.card_number),
        "card_holder": norm(data.card_holder),
        "card_bank": norm(data.card_bank),
        "sbp_phone": norm(data.sbp_phone),
        "yookassa_shop_id": norm(data.yookassa_shop_id),
        "yookassa_secret_key": secret,
        "yookassa_enabled": bool(data.yookassa_enabled),
        "updated_by": admin_id,
    }

    stmt = pg_insert(MarketplacePaymentSettings).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[MarketplacePaymentSettings.id],
        set_={k: getattr(stmt.excluded, k) for k in values if k != "id"},
    )
    await db.execute(stmt)
    await db.flush()

    result = await db.execute(
        select(MarketplacePaymentSettings).where(MarketplacePaymentSettings.id == _SINGLETON_ID)
    )
    row = result.scalar_one()
    logger.info("upsert_payment_settings: обновлено admin_id=%s", admin_id)
    return row


def to_response(row: MarketplacePaymentSettings | None) -> PaymentSettingsResponse:
    if row is None:
        return PaymentSettingsResponse()
    return PaymentSettingsResponse(
        card_number=row.card_number,
        card_holder=row.card_holder,
        card_bank=row.card_bank,
        sbp_phone=row.sbp_phone,
        yookassa_shop_id=row.yookassa_shop_id,
        yookassa_secret_set=bool(row.yookassa_secret_key),
        yookassa_enabled=row.yookassa_enabled,
        updated_at=row.updated_at,
    )


def to_card_requisites(row: MarketplacePaymentSettings | None) -> CardRequisitesPublic | None:
    """Реквизиты карты для заказчика; None, если карта не настроена."""
    if row is None or not row.card_number:
        return None
    return CardRequisitesPublic(
        card_number=row.card_number,
        card_holder=row.card_holder,
        card_bank=row.card_bank,
        sbp_phone=row.sbp_phone,
    )


async def get_effective_yookassa(db: AsyncSession) -> YookassaCredentials:
    """Ключи ЮKassa: БД (админка) приоритетнее ENV."""
    row = await get_payment_settings(db)
    if row is not None and row.yookassa_shop_id and row.yookassa_secret_key:
        return YookassaCredentials(
            enabled=row.yookassa_enabled,
            shop_id=row.yookassa_shop_id.strip(),
            secret_key=row.yookassa_secret_key.strip(),
        )
    return YookassaCredentials(
        enabled=settings.yukassa_payout_enabled,
        shop_id=settings.yukassa_payout_shop_id.strip(),
        secret_key=settings.yukassa_payout_secret_key.strip(),
    )
