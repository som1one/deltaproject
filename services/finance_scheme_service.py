import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.blogger_finance_scheme import BloggerFinanceScheme


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
