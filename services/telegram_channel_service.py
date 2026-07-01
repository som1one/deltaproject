"""Telegram channel subscription check via Bot API.

Uses the existing TELEGRAM_OAUTH_BOT_TOKEN to call getChatMember.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models.telegram_channel_sub import TelegramChannelConfig, TelegramChannelSubscription

logger = logging.getLogger(__name__)

# Statuses considered "subscribed"
_MEMBER_STATUSES = {"creator", "administrator", "member"}


async def get_channel_config(db: AsyncSession) -> TelegramChannelConfig | None:
    """Return the active channel config (singleton)."""
    result = await db.execute(
        select(TelegramChannelConfig).limit(1)
    )
    return result.scalar_one_or_none()


async def is_subscription_required(db: AsyncSession) -> bool:
    """Check if subscription requirement is enabled."""
    config = await get_channel_config(db)
    return config is not None and config.is_enabled


async def check_user_subscribed(telegram_user_id: str, channel_id: str) -> bool:
    """Call Telegram Bot API getChatMember to verify subscription.

    Returns True if the user is a member/admin/creator of the channel.
    Returns False on network errors (fail-closed) to enforce subscription.
    """
    bot_token = settings.telegram_oauth_bot_token.strip()
    if not bot_token:
        logger.warning("TELEGRAM_OAUTH_BOT_TOKEN not set, skipping subscription check")
        return True  # Fail-open if bot token not configured

    # Use proxy if configured (needed for servers where api.telegram.org is blocked)
    proxy_url = settings.telegram_oauth_proxy.strip() or None
    is_reverse_proxy = proxy_url and proxy_url.startswith("https://")

    if is_reverse_proxy:
        # Cloudflare Worker reverse-proxy: rewrite the base URL
        url = f"{proxy_url.rstrip('/')}/bot{bot_token}/getChatMember"
        transport = None
    else:
        url = f"https://api.telegram.org/bot{bot_token}/getChatMember"
        transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None

    params = {"chat_id": channel_id, "user_id": telegram_user_id}

    headers: dict[str, str] = {}
    proxy_secret = settings.telegram_oauth_proxy_secret.strip()
    if proxy_secret:
        headers["X-Proxy-Secret"] = proxy_secret

    try:
        async with httpx.AsyncClient(
            timeout=15.0, transport=transport, trust_env=False,
        ) as client:
            resp = await client.get(url, params=params, headers=headers)
            data = resp.json()

        if not data.get("ok"):
            # User not found in channel or bot has no access
            logger.debug(
                "getChatMember failed for user=%s channel=%s: %s",
                telegram_user_id, channel_id, data.get("description", "unknown"),
            )
            return False

        status = data.get("result", {}).get("status", "")
        return status in _MEMBER_STATUSES

    except Exception:
        logger.exception(
            "Error checking Telegram channel subscription for user=%s channel=%s",
            telegram_user_id, channel_id,
        )
        # Fail-CLOSED: if we can't verify, deny access to enforce subscription
        return False


async def record_subscription(
    db: AsyncSession,
    telegram_user_id: str,
    channel_id: str,
    registration_ip: str | None = None,
) -> None:
    """Record a confirmed subscription for analytics."""
    sub = TelegramChannelSubscription(
        telegram_user_id=telegram_user_id,
        channel_id=channel_id,
        registration_ip=registration_ip,
    )
    db.add(sub)
    await db.flush()


async def get_subscription_stats(
    db: AsyncSession,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
) -> dict:
    """Get subscription statistics for the admin panel."""
    base_query = select(func.count(TelegramChannelSubscription.id))

    # Total all time
    total_result = await db.execute(base_query)
    total = total_result.scalar() or 0

    now = datetime.now(timezone.utc)

    # Today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        base_query.where(TelegramChannelSubscription.confirmed_at >= today_start)
    )
    today = today_result.scalar() or 0

    # This week (last 7 days)
    from datetime import timedelta
    week_start = now - timedelta(days=7)
    week_result = await db.execute(
        base_query.where(TelegramChannelSubscription.confirmed_at >= week_start)
    )
    this_week = week_result.scalar() or 0

    # This month (last 30 days)
    month_start = now - timedelta(days=30)
    month_result = await db.execute(
        base_query.where(TelegramChannelSubscription.confirmed_at >= month_start)
    )
    this_month = month_result.scalar() or 0

    # Custom period
    period_count = None
    if period_start and period_end:
        period_result = await db.execute(
            base_query.where(
                TelegramChannelSubscription.confirmed_at >= period_start,
                TelegramChannelSubscription.confirmed_at <= period_end,
            )
        )
        period_count = period_result.scalar() or 0

    return {
        "total": total,
        "today": today,
        "this_week": this_week,
        "this_month": this_month,
        "period_count": period_count,
    }


async def upsert_channel_config(
    db: AsyncSession,
    *,
    channel_id: str,
    channel_title: str = "",
    channel_url: str = "",
    is_enabled: bool = True,
) -> TelegramChannelConfig:
    """Create or update the channel config (singleton pattern)."""
    config = await get_channel_config(db)
    if config is None:
        config = TelegramChannelConfig(
            channel_id=channel_id,
            channel_title=channel_title,
            channel_url=channel_url,
            is_enabled=is_enabled,
        )
        db.add(config)
    else:
        config.channel_id = channel_id
        config.channel_title = channel_title
        config.channel_url = channel_url
        config.is_enabled = is_enabled
    await db.flush()
    await db.refresh(config)
    return config
