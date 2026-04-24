from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.deal import DealStatus
from enums.user import UserRole
from models.deal import Deal
from models.user import User


async def admin_get_overview(db: AsyncSession) -> dict:
    users_total = int(
        (await db.execute(select(func.count(User.id)))).scalar_one(),
    )
    users_inactive = int(
        (
            await db.execute(
                select(func.count(User.id)).where(User.is_active.is_(False)),
            )
        ).scalar_one(),
    )
    users_active = users_total - users_inactive

    users_by_role: dict[str, int] = {r.value: 0 for r in UserRole}
    role_rows = (
        await db.execute(select(User.role, func.count(User.id)).group_by(User.role))
    ).all()
    for role, cnt in role_rows:
        users_by_role[role.value] = int(cnt)

    balance_total_kopeks = int(
        (await db.execute(select(func.coalesce(func.sum(User.balance), 0)))).scalar_one(),
    )

    balance_by_role: dict[str, int] = {r.value: 0 for r in UserRole}
    bal_rows = (
        await db.execute(select(User.role, func.coalesce(func.sum(User.balance), 0)).group_by(User.role))
    ).all()
    for role, total in bal_rows:
        balance_by_role[role.value] = int(total)

    deals_by_status: dict[str, int] = {s.value: 0 for s in DealStatus}
    deal_rows = (
        await db.execute(select(Deal.status, func.count(Deal.id)).group_by(Deal.status))
    ).all()
    for st, cnt in deal_rows:
        deals_by_status[st.value] = int(cnt)

    deals_total = int(
        (await db.execute(select(func.count(Deal.id)))).scalar_one(),
    )

    return {
        "users_total": users_total,
        "users_active": users_active,
        "users_inactive": users_inactive,
        "users_by_role": users_by_role,
        "balance_total_kopeks": balance_total_kopeks,
        "balance_by_role": balance_by_role,
        "deals_total": deals_total,
        "deals_by_status": deals_by_status,
    }
