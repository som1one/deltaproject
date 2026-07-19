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


async def _bot_api_call(method: str, params: dict) -> dict:
    """Вызов Telegram Bot API (с учётом прокси). Возвращает распарсенный JSON.

    На сетевых ошибках возвращает ``{"ok": False, "description": <текст>}`` —
    вызывающие сами решают, fail-open или fail-closed.
    """
    bot_token = settings.telegram_oauth_bot_token.strip()
    if not bot_token:
        return {"ok": False, "description": "bot_token_not_configured"}

    # Use proxy if configured (needed for servers where api.telegram.org is blocked)
    proxy_url = settings.telegram_oauth_proxy.strip() or None
    is_reverse_proxy = proxy_url and proxy_url.startswith("https://")

    if is_reverse_proxy:
        # Cloudflare Worker reverse-proxy: rewrite the base URL
        url = f"{proxy_url.rstrip('/')}/bot{bot_token}/{method}"
        transport = None
    else:
        url = f"https://api.telegram.org/bot{bot_token}/{method}"
        transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None

    headers: dict[str, str] = {}
    proxy_secret = settings.telegram_oauth_proxy_secret.strip()
    if proxy_secret:
        headers["X-Proxy-Secret"] = proxy_secret

    try:
        async with httpx.AsyncClient(
            timeout=15.0, transport=transport, trust_env=False,
        ) as client:
            resp = await client.get(url, params=params, headers=headers)
            return resp.json()
    except Exception as exc:
        logger.exception("Telegram Bot API %s failed", method)
        return {"ok": False, "description": f"network_error: {exc}"}


async def check_user_subscribed(telegram_user_id: str, channel_id: str) -> bool:
    """Call Telegram Bot API getChatMember to verify subscription.

    Returns True if the user is a member/admin/creator of the channel.
    Returns False on network errors (fail-closed) to enforce subscription.
    """
    if not settings.telegram_oauth_bot_token.strip():
        logger.warning("TELEGRAM_OAUTH_BOT_TOKEN not set, skipping subscription check")
        return True  # Fail-open if bot token not configured

    data = await _bot_api_call(
        "getChatMember", {"chat_id": channel_id, "user_id": telegram_user_id}
    )

    if not data.get("ok"):
        # Либо юзер не подписан, либо бот не может смотреть участников
        # (не админ канала / неверный chat_id) — второе ломает ворота для всех,
        # поэтому warning, а не debug. Диагностика: /admin/telegram-channel/diagnose.
        logger.warning(
            "getChatMember failed for user=%s channel=%s: %s",
            telegram_user_id, channel_id, data.get("description", "unknown"),
        )
        return False

    status = data.get("result", {}).get("status", "")
    return status in _MEMBER_STATUSES


async def get_channel_member_count(channel_id: str) -> int | None:
    """Живое число подписчиков канала (getChatMemberCount). None — не удалось."""
    data = await _bot_api_call("getChatMemberCount", {"chat_id": channel_id})
    if not data.get("ok"):
        logger.warning(
            "getChatMemberCount failed for channel=%s: %s",
            channel_id, data.get("description", "unknown"),
        )
        return None
    result = data.get("result")
    return int(result) if isinstance(result, int) else None


async def diagnose_channel_access(channel_id: str) -> dict:
    """Проверка настроек ворот: виден ли канал боту и может ли он проверять подписку.

    Возвращает поля для админки; ``can_check_members`` — главный вердикт
    (для каналов getChatMember работает, только если бот — админ канала).
    """
    bot_token = settings.telegram_oauth_bot_token.strip()
    if not bot_token:
        return {
            "bot_configured": False,
            "chat_found": False,
            "chat_title": "",
            "bot_status": "",
            "can_check_members": False,
            "member_count": None,
            "error_hint": "TELEGRAM_OAUTH_BOT_TOKEN не настроен на сервере.",
        }

    chat = await _bot_api_call("getChat", {"chat_id": channel_id})
    if not chat.get("ok"):
        return {
            "bot_configured": True,
            "chat_found": False,
            "chat_title": "",
            "bot_status": "",
            "can_check_members": False,
            "member_count": None,
            "error_hint": (
                f"Канал не найден ботом: {chat.get('description', 'unknown')}. "
                "Проверьте ID канала (@username или -100…) и что бот добавлен в канал."
            ),
        }
    chat_title = str(chat.get("result", {}).get("title", ""))

    bot_id = bot_token.split(":", 1)[0]
    member = await _bot_api_call(
        "getChatMember", {"chat_id": channel_id, "user_id": bot_id}
    )
    bot_status = str(member.get("result", {}).get("status", "")) if member.get("ok") else ""
    is_admin = bot_status in {"administrator", "creator"}

    member_count = await get_channel_member_count(channel_id)

    error_hint = ""
    if not member.get("ok"):
        error_hint = (
            f"Бот не видит себя в канале: {member.get('description', 'unknown')}. "
            "Добавьте бота администратором канала."
        )
    elif not is_admin:
        error_hint = (
            f"Бот в канале со статусом «{bot_status}», но для проверки подписчиков "
            "он должен быть администратором канала."
        )

    return {
        "bot_configured": True,
        "chat_found": True,
        "chat_title": chat_title,
        "bot_status": bot_status,
        "can_check_members": is_admin,
        "member_count": member_count,
        "error_hint": error_hint,
    }


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
    """Get subscription statistics for the admin panel.

    Считаем УНИКАЛЬНЫЕ telegram-аккаунты: один человек, вошедший пять раз,
    — это одна подписка, а не пять записей журнала.
    """
    base_query = select(func.count(func.distinct(TelegramChannelSubscription.telegram_user_id)))

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


async def get_daily_subscription_series(db: AsyncSession, days: int) -> list[dict]:
    """Уникальные прошедшие проверку по дням за ``days`` дней (zero-filled, UTC)."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    day = func.date_trunc("day", TelegramChannelSubscription.confirmed_at)
    result = await db.execute(
        select(day.label("day"), func.count(func.distinct(TelegramChannelSubscription.telegram_user_id)))
        .where(TelegramChannelSubscription.confirmed_at >= start)
        .group_by(day)
        .order_by(day)
    )
    counts = {row[0].date().isoformat(): row[1] for row in result.all()}
    return [
        {"date": (start + timedelta(days=offset)).date().isoformat(),
         "count": counts.get((start + timedelta(days=offset)).date().isoformat(), 0)}
        for offset in range(days)
    ]


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
