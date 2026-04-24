import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.ledger import LedgerEntryStatus
from models.ledger_entry import LedgerEntry
from models.user import User
from schemas.ledger import PayoutRequestCreate
from services.yookassa_payout_client import YookassaPayoutError, create_payout


_ACTIVE_PAYOUT_STATUSES = (
    LedgerEntryStatus.PAYOUT_REQUEST,
    LedgerEntryStatus.FREEZE,
    LedgerEntryStatus.PENDING_CONFIRMATION,
)


async def sum_pending_confirmation_kopeks(user_id: uuid.UUID, db: AsyncSession) -> int:
    """Сумма по заявкам в статусах «ожидает цепочки выплаты» (п.8 ТЗ)."""
    result = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
            LedgerEntry.user_id == user_id,
            LedgerEntry.status.in_(_ACTIVE_PAYOUT_STATUSES),
        ),
    )
    return int(result.scalar_one())


async def _reserved_payout_kopeks(user_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(LedgerEntry.amount_kopeks), 0)).where(
            LedgerEntry.user_id == user_id,
            LedgerEntry.status.in_(_ACTIVE_PAYOUT_STATUSES),
        ),
    )
    return int(result.scalar_one())


async def list_ledger_for_user(
    user_id: uuid.UUID,
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    status_filter: LedgerEntryStatus | None,
) -> tuple[list[LedgerEntry], int]:
    base = select(LedgerEntry).where(LedgerEntry.user_id == user_id)
    count_stmt = select(func.count(LedgerEntry.id)).where(LedgerEntry.user_id == user_id)
    if status_filter is not None:
        base = base.where(LedgerEntry.status == status_filter)
        count_stmt = count_stmt.where(LedgerEntry.status == status_filter)
    total = int((await db.execute(count_stmt)).scalar_one())
    base = base.order_by(LedgerEntry.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(base)).scalars().all()
    return list(rows), total


async def create_payout_request(user: User, body: PayoutRequestCreate, db: AsyncSession) -> LedgerEntry:
    reserved = await _reserved_payout_kopeks(user.id, db)
    if user.balance < reserved + body.amount_kopeks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недостаточно средств с учётом активных заявок на выплату",
        )

    if settings.yukassa_payout_active:
        if not body.payout_token or not str(body.payout_token).strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Укажите карту через форму ЮKassa (поле payout_token)",
            )
        entry = LedgerEntry(
            user_id=user.id,
            deal_id=None,
            amount_kopeks=body.amount_kopeks,
            status=LedgerEntryStatus.PAYOUT_REQUEST,
        )
        db.add(entry)
        await db.flush()
        try:
            payout_id, y_status = await create_payout(
                amount_kopeks=body.amount_kopeks,
                payout_token=str(body.payout_token).strip(),
                description=f"Выплата пользователю {user.id}",
                metadata={"ledger_entry_id": str(entry.id), "user_id": str(user.id)},
                idempotency_key=str(entry.id),
            )
        except YookassaPayoutError as e:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(e),
            ) from e
        entry.yookassa_payout_id = payout_id
        await db.commit()
        await db.refresh(entry)
        if y_status == "succeeded":
            await apply_yukassa_payout_finished(entry.id, success=True, db=db, note=None)
            await db.refresh(entry)
        return entry

    entry = LedgerEntry(
        user_id=user.id,
        deal_id=None,
        amount_kopeks=body.amount_kopeks,
        status=LedgerEntryStatus.PAYOUT_REQUEST,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def apply_yukassa_payout_finished(
    entry_id: uuid.UUID,
    *,
    success: bool,
    db: AsyncSession,
    note: str | None,
) -> None:
    """Завершение выплаты по вебхуку ЮKassa или сразу после create (status=succeeded). Идемпотентно."""
    entry = (
        await db.execute(select(LedgerEntry).where(LedgerEntry.id == entry_id).with_for_update())
    ).scalar_one_or_none()
    if entry is None:
        return
    if entry.status == LedgerEntryStatus.COMPLETED:
        return
    if entry.status == LedgerEntryStatus.REJECTED:
        return
    if entry.status not in _ACTIVE_PAYOUT_STATUSES:
        return

    if success:
        user = (
            await db.execute(select(User).where(User.id == entry.user_id).with_for_update())
        ).scalar_one_or_none()
        if user is None:
            return
        if user.balance < entry.amount_kopeks:
            return
        user.balance -= entry.amount_kopeks
        entry.status = LedgerEntryStatus.COMPLETED
    else:
        entry.status = LedgerEntryStatus.REJECTED
        if note:
            entry.note = note
    entry.updated_at = datetime.now(UTC)
    await db.commit()


async def admin_patch_ledger_status(
    entry_id: uuid.UUID,
    new_status: LedgerEntryStatus,
    note: str | None,
    db: AsyncSession,
) -> LedgerEntry:
    entry = await db.get(LedgerEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись журнала не найдена")
    if entry.status == LedgerEntryStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Проведённую операцию нельзя изменить",
        )

    if new_status == LedgerEntryStatus.COMPLETED and entry.status != LedgerEntryStatus.COMPLETED:
        user = await db.get(User, entry.user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
        if user.balance < entry.amount_kopeks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="На балансе пользователя недостаточно средств для проведения выплаты",
            )
        user.balance -= entry.amount_kopeks

    entry.status = new_status
    if note is not None:
        entry.note = note
    entry.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(entry)
    return entry


def _admin_ledger_filters(
    stmt: Select,
    *,
    status_filter: LedgerEntryStatus | None,
    user_id: uuid.UUID | None,
    created_from: datetime | None,
    created_to: datetime | None,
) -> Select:
    if status_filter is not None:
        stmt = stmt.where(LedgerEntry.status == status_filter)
    if user_id is not None:
        stmt = stmt.where(LedgerEntry.user_id == user_id)
    if created_from is not None:
        stmt = stmt.where(LedgerEntry.created_at >= created_from)
    if created_to is not None:
        stmt = stmt.where(LedgerEntry.created_at <= created_to)
    return stmt


async def admin_list_ledger(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    status_filter: LedgerEntryStatus | None,
    user_id: uuid.UUID | None,
    created_from: datetime | None,
    created_to: datetime | None,
) -> tuple[list[LedgerEntry], int]:
    base = select(LedgerEntry)
    count_stmt = select(func.count(LedgerEntry.id))
    base = _admin_ledger_filters(
        base,
        status_filter=status_filter,
        user_id=user_id,
        created_from=created_from,
        created_to=created_to,
    )
    count_stmt = _admin_ledger_filters(
        count_stmt,
        status_filter=status_filter,
        user_id=user_id,
        created_from=created_from,
        created_to=created_to,
    )
    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(
            base.order_by(LedgerEntry.created_at.desc()).limit(limit).offset(offset)
        )
    ).scalars().all()
    return list(rows), total


async def admin_get_ledger_entry(entry_id: uuid.UUID, db: AsyncSession) -> LedgerEntry:
    entry = await db.get(LedgerEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись журнала не найдена")
    return entry


async def admin_complete_payout(entry_id: uuid.UUID, db: AsyncSession) -> LedgerEntry:
    entry = (
        await db.execute(
            select(LedgerEntry).where(LedgerEntry.id == entry_id).with_for_update()
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись журнала не найдена")

    if entry.status == LedgerEntryStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Выплата уже проведена",
        )
    if entry.status == LedgerEntryStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отклоненную выплату нельзя провести",
        )
    if entry.status not in _ACTIVE_PAYOUT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Текущий статус записи не позволяет провести выплату",
        )

    user = (await db.execute(select(User).where(User.id == entry.user_id).with_for_update())).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.balance < entry.amount_kopeks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="На балансе пользователя недостаточно средств для проведения выплаты",
        )

    user.balance -= entry.amount_kopeks
    entry.status = LedgerEntryStatus.COMPLETED
    entry.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(entry)
    return entry
