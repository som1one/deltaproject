import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.ledger_entry import LedgerEntry
from models.user import User
from schemas.admin import AdminUserPatch


async def admin_list_users(
    db: AsyncSession,
    *,
    role: UserRole | None,
    email: str | None,
    linked_to: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[User], int]:
    base = select(User)
    count_stmt = select(func.count(User.id))

    if role is not None:
        base = base.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)
    if email is not None and email.strip():
        email_q = email.strip().lower()
        base = base.where(func.lower(User.email).like(f"%{email_q}%"))
        count_stmt = count_stmt.where(func.lower(User.email).like(f"%{email_q}%"))
    if linked_to is not None:
        base = base.where(User.linked_to == linked_to)
        count_stmt = count_stmt.where(User.linked_to == linked_to)

    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(base.order_by(User.id.asc()).limit(limit).offset(offset))
    ).scalars().all()
    return list(rows), total


async def admin_get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


async def admin_patch_user(
    user_id: uuid.UUID,
    body: AdminUserPatch,
    current_admin: User,
    db: AsyncSession,
) -> User:
    user = await admin_get_user(user_id, db)

    if body.email is not None:
        email_value = str(body.email).strip().lower()
        conflict = await db.execute(
            select(User).where(User.email == email_value, User.id != user.id),
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже занят")
        user.email = email_value
    if body.telegram is not None:
        user.telegram = body.telegram
    if body.name is not None:
        user.name = body.name
    if body.percent is not None:
        user.percent = float(body.percent)
    if body.is_active is not None:
        if user.id == current_admin.id and body.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нельзя деактивировать текущего администратора",
            )
        user.is_active = bool(body.is_active)
    if body.role is not None and body.role != user.role:
        if body.role == UserRole.ADMIN:
            existing_admin = await db.execute(
                select(User).where(User.role == UserRole.ADMIN, User.id != user.id),
            )
            if existing_admin.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Администратор уже существует",
                )
        if user.role == UserRole.ADMIN and body.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нельзя понизить роль единственного администратора",
            )
        user.role = body.role

    await db.commit()
    await db.refresh(user)
    return user


async def admin_get_user_ledger(
    user_id: uuid.UUID,
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    status_filter: LedgerEntryStatus | None,
) -> tuple[list[LedgerEntry], int]:
    await admin_get_user(user_id, db)
    stmt = select(LedgerEntry).where(LedgerEntry.user_id == user_id)
    count_stmt = select(func.count(LedgerEntry.id)).where(LedgerEntry.user_id == user_id)
    if status_filter is not None:
        stmt = stmt.where(LedgerEntry.status == status_filter)
        count_stmt = count_stmt.where(LedgerEntry.status == status_filter)
    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(stmt.order_by(LedgerEntry.created_at.desc()).limit(limit).offset(offset))
    ).scalars().all()
    return list(rows), total


async def admin_delete_user(
    user_id: uuid.UUID,
    current_admin: User,
    db: AsyncSession,
) -> None:
    user = await admin_get_user(user_id, db)
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить текущего администратора",
        )
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить единственного администратора",
        )
    await db.delete(user)
    await db.commit()
