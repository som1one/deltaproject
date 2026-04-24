import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.blogger_finance_scheme import BloggerFinanceScheme
from models.user import User
from schemas.finance import FinanceSchemeAdminPut, FinanceSchemeAdminRead


DEFAULT_WEIGHT_WORKER = 2000
DEFAULT_WEIGHT_BLOGER = 5000
DEFAULT_WEIGHT_UPLINE = 1000
DEFAULT_WEIGHT_PLATFORM = 8000


async def get_or_create_scheme_for_blogger(
    blogger_id: uuid.UUID,
    db: AsyncSession,
) -> BloggerFinanceScheme:
    result = await db.execute(
        select(BloggerFinanceScheme).where(BloggerFinanceScheme.blogger_id == blogger_id),
    )
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = BloggerFinanceScheme(
        blogger_id=blogger_id,
        weight_worker=DEFAULT_WEIGHT_WORKER,
        weight_bloger=DEFAULT_WEIGHT_BLOGER,
        weight_upline=DEFAULT_WEIGHT_UPLINE,
        weight_platform=DEFAULT_WEIGHT_PLATFORM,
    )
    db.add(row)
    await db.flush()
    return row


def distribute_price_kopeks(
    price: int,
    scheme: BloggerFinanceScheme,
) -> tuple[int, int, int, int]:
    """Возвращает (worker, bloger, upline, platform) в копейках, сумма = price."""
    w = scheme.weight_worker
    b = scheme.weight_bloger
    u = scheme.weight_upline
    p = scheme.weight_platform
    total = w + b + u + p
    if total <= 0:
        return 0, 0, 0, 0
    wk = price * w // total
    bk = price * b // total
    uk = price * u // total
    pk = price - wk - bk - uk
    return wk, bk, uk, pk


def _scheme_to_read(user: User, scheme: BloggerFinanceScheme | None) -> FinanceSchemeAdminRead:
    if scheme is not None:
        return FinanceSchemeAdminRead(
            blogger_id=user.id,
            blogger_name=user.name,
            blogger_email=user.email,
            scheme_id=scheme.id,
            weight_worker=scheme.weight_worker,
            weight_bloger=scheme.weight_bloger,
            weight_upline=scheme.weight_upline,
            weight_platform=scheme.weight_platform,
        )
    return FinanceSchemeAdminRead(
        blogger_id=user.id,
        blogger_name=user.name,
        blogger_email=user.email,
        scheme_id=None,
        weight_worker=DEFAULT_WEIGHT_WORKER,
        weight_bloger=DEFAULT_WEIGHT_BLOGER,
        weight_upline=DEFAULT_WEIGHT_UPLINE,
        weight_platform=DEFAULT_WEIGHT_PLATFORM,
    )


async def admin_list_finance_schemes(
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    email_filter: str | None,
) -> tuple[list[FinanceSchemeAdminRead], int]:
    conditions = [User.role == UserRole.BLOGER, User.is_active.is_(True)]
    if email_filter and email_filter.strip():
        conditions.append(User.email.ilike(f"%{email_filter.strip()}%"))
    count_stmt = select(func.count()).select_from(User).where(*conditions)
    total = int((await db.execute(count_stmt)).scalar_one())
    stmt = (
        select(User)
        .where(*conditions)
        .order_by(User.name.asc())
        .limit(limit)
        .offset(offset)
    )
    users = list((await db.execute(stmt)).scalars().all())
    items: list[FinanceSchemeAdminRead] = []
    for u in users:
        res = await db.execute(
            select(BloggerFinanceScheme).where(BloggerFinanceScheme.blogger_id == u.id),
        )
        sch = res.scalar_one_or_none()
        items.append(_scheme_to_read(u, sch))
    return items, total


async def admin_get_finance_scheme(blogger_id: uuid.UUID, db: AsyncSession) -> FinanceSchemeAdminRead:
    user = await db.get(User, blogger_id)
    if user is None or user.role != UserRole.BLOGER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Блогер не найден")
    res = await db.execute(
        select(BloggerFinanceScheme).where(BloggerFinanceScheme.blogger_id == blogger_id),
    )
    sch = res.scalar_one_or_none()
    return _scheme_to_read(user, sch)


async def admin_put_finance_scheme(
    blogger_id: uuid.UUID,
    body: FinanceSchemeAdminPut,
    db: AsyncSession,
) -> FinanceSchemeAdminRead:
    user = await db.get(User, blogger_id)
    if user is None or user.role != UserRole.BLOGER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Блогер не найден")
    result = await db.execute(
        select(BloggerFinanceScheme)
        .where(BloggerFinanceScheme.blogger_id == blogger_id)
        .with_for_update(),
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = BloggerFinanceScheme(
            blogger_id=blogger_id,
            weight_worker=body.weight_worker,
            weight_bloger=body.weight_bloger,
            weight_upline=body.weight_upline,
            weight_platform=body.weight_platform,
        )
        db.add(row)
    else:
        row.weight_worker = body.weight_worker
        row.weight_bloger = body.weight_bloger
        row.weight_upline = body.weight_upline
        row.weight_platform = body.weight_platform
    await db.commit()
    await db.refresh(row)
    return _scheme_to_read(user, row)
