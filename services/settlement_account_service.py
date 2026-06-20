"""Сервис управления реквизитами расчётного счёта (singleton).

Расчётный счёт хранится как единственная запись с id=1.
Upsert реализован через INSERT ... ON CONFLICT (id) DO UPDATE.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models.settlement_account import SettlementAccount
from schemas.settlement_account import SettlementAccountUpsert

logger = logging.getLogger(__name__)

# Singleton ID расчётного счёта — всегда 1
_SINGLETON_ID = 1


async def get_settlement_account(db: AsyncSession) -> SettlementAccount | None:
    """Получить текущие реквизиты расчётного счёта.

    Returns:
        SettlementAccount если реквизиты настроены, иначе None.
    """
    result = await db.execute(
        select(SettlementAccount).where(SettlementAccount.id == _SINGLETON_ID)
    )
    return result.scalar_one_or_none()


async def upsert_settlement_account(
    db: AsyncSession,
    data: SettlementAccountUpsert,
    admin_id: uuid.UUID,
) -> SettlementAccount:
    """Создать или обновить реквизиты расчётного счёта.

    Использует INSERT ... ON CONFLICT (id) DO UPDATE для атомарного upsert.
    Всегда записывает в строку с id=1 (singleton).

    Args:
        db: Асинхронная сессия SQLAlchemy.
        data: Валидированные данные реквизитов.
        admin_id: UUID администратора, выполняющего операцию.

    Returns:
        Обновлённый объект SettlementAccount.
    """
    stmt = pg_insert(SettlementAccount).values(
        id=_SINGLETON_ID,
        account_number=data.account_number,
        bic=data.bic,
        bank_name=data.bank_name,
        recipient_name=data.recipient_name,
        updated_by=admin_id,
    )

    stmt = stmt.on_conflict_do_update(
        index_elements=[SettlementAccount.id],
        set_={
            "account_number": stmt.excluded.account_number,
            "bic": stmt.excluded.bic,
            "bank_name": stmt.excluded.bank_name,
            "recipient_name": stmt.excluded.recipient_name,
            "updated_by": stmt.excluded.updated_by,
        },
    )

    await db.execute(stmt)
    await db.flush()

    # Получаем актуальную запись (с обновлённым updated_at из server_default/onupdate)
    result = await db.execute(
        select(SettlementAccount).where(SettlementAccount.id == _SINGLETON_ID)
    )
    account = result.scalar_one()

    logger.info(
        "upsert_settlement_account: реквизиты обновлены admin_id=%s",
        admin_id,
    )
    return account
