"""Admin endpoints for Telegram channel subscription management + public check endpoint."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from models.user import User
from schemas.admin import AdminDailySeriesResponse
from schemas.telegram_channel import (
    TelegramChannelConfigRead,
    TelegramChannelConfigSet,
    TelegramChannelDiagnoseResponse,
    TelegramChannelMemberCountResponse,
    TelegramChannelStatsResponse,
    TelegramChannelSubCheck,
)
from services.telegram_channel_service import (
    check_user_subscribed,
    diagnose_channel_access,
    get_channel_config,
    get_channel_member_count,
    get_daily_subscription_series,
    get_subscription_stats,
    upsert_channel_config,
)

router = APIRouter(tags=["telegram-channel"])


# ─── Admin endpoints ────────────────────────────────────────────────────────

@router.get("/admin/telegram-channel", response_model=TelegramChannelConfigRead | None)
async def admin_get_channel_config(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
):
    config = await get_channel_config(db)
    if config is None:
        return None
    return TelegramChannelConfigRead.model_validate(config)


@router.put("/admin/telegram-channel", response_model=TelegramChannelConfigRead)
async def admin_set_channel_config(
    body: TelegramChannelConfigSet,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
):
    config = await upsert_channel_config(
        db,
        channel_id=body.channel_id,
        channel_title=body.channel_title,
        channel_url=body.channel_url,
        is_enabled=body.is_enabled,
    )
    await db.commit()
    return TelegramChannelConfigRead.model_validate(config)


@router.get("/admin/telegram-channel/stats", response_model=TelegramChannelStatsResponse)
async def admin_get_channel_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    period_start: datetime | None = Query(default=None),
    period_end: datetime | None = Query(default=None),
):
    stats = await get_subscription_stats(db, period_start, period_end)
    return TelegramChannelStatsResponse(**stats)


@router.get("/admin/telegram-channel/stats/daily", response_model=AdminDailySeriesResponse)
async def admin_get_channel_daily_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    days: int = Query(default=30, ge=7, le=180),
):
    """Подписки на канал по дням — для графика в разделе «Статистика»."""
    series = await get_daily_subscription_series(db, days)
    return AdminDailySeriesResponse(days=days, series=series)


@router.get("/admin/telegram-channel/member-count", response_model=TelegramChannelMemberCountResponse)
async def admin_get_channel_member_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
):
    """Живое число подписчиков канала (Bot API getChatMemberCount)."""
    config = await get_channel_config(db)
    if config is None:
        return TelegramChannelMemberCountResponse(count=None)
    count = await get_channel_member_count(config.channel_id)
    return TelegramChannelMemberCountResponse(count=count)


@router.get("/admin/telegram-channel/diagnose", response_model=TelegramChannelDiagnoseResponse)
async def admin_diagnose_channel(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
):
    """Проверка доступа бота к каналу: найден ли канал, админ ли бот.

    Если ``can_check_members`` = false, ворота не пускают даже подписанных
    (getChatMember по чужому user_id работает только у бота-администратора).
    """
    config = await get_channel_config(db)
    if config is None:
        raise HTTPException(status_code=404, detail="Канал не настроен")
    data = await diagnose_channel_access(config.channel_id)
    return TelegramChannelDiagnoseResponse(**data)


@router.get("/admin/telegram-channel/check/{telegram_user_id}")
async def admin_check_user_subscription(
    telegram_user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
):
    """Admin: manually check if a Telegram user is subscribed."""
    config = await get_channel_config(db)
    if config is None or not config.is_enabled:
        return {"subscribed": True, "reason": "subscription_not_required"}
    subscribed = await check_user_subscribed(telegram_user_id, config.channel_id)
    return {"subscribed": subscribed, "channel_id": config.channel_id}


# ─── Public endpoint (used during registration flow) ─────────────────────────

@router.get("/auth/telegram/subscription-check", response_model=TelegramChannelSubCheck)
async def public_subscription_check(
    telegram_user_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Check if the user is subscribed to the required channel.

    Called by the frontend after Telegram OAuth, before finalizing registration.
    """
    config = await get_channel_config(db)
    if config is None or not config.is_enabled:
        return TelegramChannelSubCheck(
            required=False,
            subscribed=True,
            channel_url="",
            channel_title="",
        )

    subscribed = await check_user_subscribed(telegram_user_id, config.channel_id)
    return TelegramChannelSubCheck(
        required=True,
        subscribed=subscribed,
        channel_url=config.channel_url,
        channel_title=config.channel_title,
    )
