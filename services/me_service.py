from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.blogger_stat import BloggerStat
from models.user import User
from models.worker_stat import WorkerStat
from schemas.me import UserMePatch, UserMeRead
from services.ledger_service import sum_pending_confirmation_kopeks
from utils.security import hash_password, verify_password


async def user_to_me_read(user: User, db: AsyncSession) -> UserMeRead:
    pending = await sum_pending_confirmation_kopeks(user.id, db)
    return UserMeRead(
        id=user.id,
        name=user.name,
        email=user.email,
        telegram=user.telegram,
        role=user.role,
        linked_to=user.linked_to,
        percent=user.percent,
        balance=user.balance,
        balance_pending_confirmation_kopeks=pending,
    )


async def apply_me_patch(user: User, body: UserMePatch, db: AsyncSession) -> User:
    if body.name is not None:
        user.name = body.name
    if body.telegram is not None:
        user.telegram = body.telegram
    if body.email is not None:
        conflict = await db.execute(
            select(User).where(User.email == str(body.email), User.id != user.id),
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email уже занят",
            )
        user.email = str(body.email)
    if body.password is not None:
        assert body.current_password is not None
        if not verify_password(body.current_password, user.hash_pass):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный текущий пароль",
            )
        user.hash_pass = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return user


async def get_or_create_worker_stat(user_id, db: AsyncSession) -> WorkerStat:
    result = await db.execute(select(WorkerStat).where(WorkerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = WorkerStat(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_or_create_blogger_stat(user_id, db: AsyncSession) -> BloggerStat:
    result = await db.execute(select(BloggerStat).where(BloggerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = BloggerStat(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
