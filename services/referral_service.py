import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.referral import ReferralLink
from models.user import User


async def create_referral_for_blogger(
    user: User,
    link: str,
    db: AsyncSession,
) -> ReferralLink:
    row = ReferralLink(user_id=user.id, link=link)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise
    await db.refresh(row)
    return row


async def get_referral_by_id(
    referral_id: uuid.UUID,
    db: AsyncSession,
) -> ReferralLink | None:
    return await db.get(ReferralLink, referral_id)


async def get_referral_by_username(
    username: str,
    db: AsyncSession,
) -> ReferralLink | None:
    # В текущей модели username как отдельное поле еще не добавлен,
    # поэтому используем fallback по тексту ссылки.
    result = await db.execute(
        select(ReferralLink).where(ReferralLink.link.contains(f"/ref/{username}")),
    )
    return result.scalar_one_or_none()


async def is_valid_blogger_referral(ref: ReferralLink, db: AsyncSession) -> bool:
    blogger = await db.get(User, ref.user_id)
    return blogger is not None and blogger.role == UserRole.BLOGER


async def set_worker_linked_to(worker: User, blogger_id: uuid.UUID, db: AsyncSession) -> None:
    worker.linked_to = blogger_id
    await db.commit()
    await db.refresh(worker)
