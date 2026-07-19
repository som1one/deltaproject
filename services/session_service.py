import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models.user import User
from models.user_session import UserSession


async def count_registration_sessions_for_ip_since(
    db: AsyncSession,
    ip: str,
    since: datetime,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(UserSession)
        .where(
            UserSession.ip == ip,
            UserSession.created_at >= since,
            UserSession.session_kind == "register",
        ),
    )
    return int(result.scalar_one())


async def assert_registration_allowed_for_ip(db: AsyncSession, ip: str) -> None:
    """Слишком много регистраций с одного IP за окно — 429."""
    window = timedelta(hours=settings.register_ip_window_hours)
    since = datetime.now(timezone.utc) - window
    n = await count_registration_sessions_for_ip_since(db, ip, since)
    if n >= settings.register_max_sessions_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит регистраций с этого адреса. Попробуйте позже.",
        )


async def count_login_sessions_for_ip_since(
    db: AsyncSession,
    ip: str,
    since: datetime,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(UserSession)
        .where(
            UserSession.ip == ip,
            UserSession.created_at >= since,
            UserSession.session_kind == "login",
        ),
    )
    return int(result.scalar_one())


async def assert_login_allowed_for_ip(db: AsyncSession, ip: str) -> None:
    window = timedelta(hours=settings.login_ip_window_hours)
    since = datetime.now(timezone.utc) - window
    n = await count_login_sessions_for_ip_since(db, ip, since)
    if n >= settings.login_max_sessions_per_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит входов с этого адреса. Попробуйте позже.",
        )


async def count_referral_registrations_for_ip_and_blogger(
    db: AsyncSession,
    ip: str,
    blogger_id: uuid.UUID,
    since: datetime,
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(UserSession)
        .join(User, UserSession.user_id == User.id)
        .where(
            UserSession.ip == ip,
            UserSession.created_at >= since,
            UserSession.session_kind == "register",
            User.linked_to == blogger_id,
        ),
    )
    return int(result.scalar_one())


async def assert_referral_registration_allowed_for_ip(
    db: AsyncSession,
    ip: str,
    blogger_id: uuid.UUID,
) -> None:
    window = timedelta(hours=settings.ref_ip_window_hours)
    since = datetime.now(timezone.utc) - window
    n = await count_referral_registrations_for_ip_and_blogger(db, ip, blogger_id, since)
    if n >= settings.ref_max_registrations_per_ip_per_blogger:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много регистраций по этой реферальной ссылке с вашего адреса.",
        )


async def get_daily_login_series(db: AsyncSession, days: int) -> list[dict]:
    """Уникальные вошедшие пользователи по дням за ``days`` дней (zero-filled, UTC).

    Считаем DISTINCT user_id по сессиям kind='login' — «сколько человек
    пришло» в продукт в конкретный день, а не сырое число входов.
    """
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    day = func.date_trunc("day", UserSession.created_at)
    result = await db.execute(
        select(day.label("day"), func.count(func.distinct(UserSession.user_id)))
        .where(
            UserSession.created_at >= start,
            UserSession.session_kind == "login",
            UserSession.user_id.is_not(None),
        )
        .group_by(day)
        .order_by(day)
    )
    counts = {row[0].date().isoformat(): row[1] for row in result.all()}
    return [
        {"date": (start + timedelta(days=offset)).date().isoformat(),
         "count": counts.get((start + timedelta(days=offset)).date().isoformat(), 0)}
        for offset in range(days)
    ]


async def record_user_session(
    db: AsyncSession,
    ip: str,
    user_agent: str,
    user_id: uuid.UUID | None = None,
    *,
    session_kind: str = "login",
) -> UserSession:
    agent = (user_agent or "")[:512]
    row = UserSession(
        ip=ip,
        agent=agent,
        user_id=user_id,
        session_kind=session_kind,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
