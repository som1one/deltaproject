"""Telegram-уведомления пользователям через бота платформы.

Отправка — fire-and-forget (asyncio.create_task): сбой доставки (юзер не
запустил бота → 403, сеть, лимиты) НИКОГДА не ломает основной флоу и не
трогает БД. Chat id берётся из явной привязки (User.telegram_chat_id,
диплинк t.me/<bot>?start=<payload> с HMAC-подписью) или из синтетического
email телеграм-аккаунтов (tg_<id>@… / tg_client_<id>@…).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import html
import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from models.marketplace_order import MarketplaceOrder
from models.user import User
# Приватная, но переиспользуем осознанно: прокси через Cloudflare Worker,
# ретраи на 429/5xx и токен бота живут в одном месте (DRY).
from services.telegram_channel_service import _bot_api_call

logger = logging.getLogger(__name__)

# Синтетические email телеграм-аккаунтов (см. services/telegram_user_service.py):
# воркер — tg_<id>@telegram.example.com, клиент — tg_client_<id>@telegram.example.com
_SYNTHETIC_TG_EMAIL_RE = re.compile(r"^tg_(?:client_)?(\d+)@")

# Диплинк: hex(uuid, 32 симв) + первые 16 симв hex HMAC-SHA256 = 48 символов
# (лимит Telegram на payload /start — 64).
_PAYLOAD_SIG_LENGTH = 16
_PAYLOAD_LENGTH = 32 + _PAYLOAD_SIG_LENGTH

# Event loop держит только слабую ссылку на таск — без «якоря» fire-and-forget
# отправка может быть собрана GC до завершения.
_pending_tasks: set[asyncio.Task] = set()


def format_rub(amount_kopeks: int) -> str:
    """Копейки → «12 345 ₽»: без копеек, с пробелом-разделителем тысяч."""
    return f"{amount_kopeks // 100:,}".replace(",", " ") + " ₽"


def escape_html(text: str) -> str:
    """Экранировать пользовательский текст для parse_mode=HTML."""
    return html.escape(text, quote=False)


def order_url(order_id: uuid.UUID | str) -> str:
    """Страница сделки на маркетплейсе (для заказчика и автора)."""
    return f"{settings.marketplace_frontend_url.rstrip('/')}/orders/{order_id}"


def cabinet_url() -> str:
    """Кабинет воркера на главном сайте."""
    return f"{settings.main_frontend_url.rstrip('/')}/cabinet"


def short_order_no(order_id: uuid.UUID | str) -> str:
    """Короткий номер заказа для текстов уведомлений."""
    return str(order_id)[:8]


# ─── Привязка чата (диплинк /start) ─────────────────────────────────────────

def _sign_payload(uid_hex: str) -> str:
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        uid_hex.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:_PAYLOAD_SIG_LENGTH]


def build_connect_payload(user_id: uuid.UUID) -> str:
    """hex(uuid) + подпись — payload диплинка t.me/<bot>?start=<payload>."""
    uid_hex = user_id.hex
    return uid_hex + _sign_payload(uid_hex)


def verify_connect_payload(payload: str) -> uuid.UUID | None:
    """Проверить подпись диплинка. None — payload битый или подделан."""
    if len(payload) != _PAYLOAD_LENGTH:
        return None
    uid_hex, signature = payload[:32], payload[32:]
    if not hmac.compare_digest(signature, _sign_payload(uid_hex)):
        return None
    try:
        return uuid.UUID(hex=uid_hex)
    except ValueError:
        return None


def build_connect_url(user_id: uuid.UUID) -> str:
    """Диплинк привязки уведомлений для кнопки «Подключить Telegram»."""
    bot_username = settings.telegram_oauth_bot_username.strip().lstrip("@")
    return f"https://t.me/{bot_username}?start={build_connect_payload(user_id)}"


# ─── Отправка ───────────────────────────────────────────────────────────────

def resolve_chat_id(user: User) -> int | None:
    """Chat id для отправки: явная привязка или телеграм-ид из email."""
    if user.telegram_chat_id is not None:
        return user.telegram_chat_id
    match = _SYNTHETIC_TG_EMAIL_RE.match(user.email or "")
    if match:
        return int(match.group(1))
    return None


def notify_user_telegram(user: User, text: str) -> None:
    """Отправить пользователю сообщение в Telegram (фоново, best-effort).

    Chat id резолвится сразу (до create_task) — фоновому таску БД не нужна.
    Нет привязки — молча выходим: Telegram-канал опционален.
    """
    chat_id = resolve_chat_id(user)
    if chat_id is None:
        return
    task = asyncio.create_task(_send_message(chat_id, text))
    _pending_tasks.add(task)
    task.add_done_callback(_pending_tasks.discard)


async def _send_message(chat_id: int, text: str) -> None:
    try:
        data = await _bot_api_call(
            "sendMessage",
            {
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        )
        if not data.get("ok"):
            # 403 «bot was blocked» / «chat not found» — норма: юзер не
            # запускал бота. Ошибка доставки не должна ломать основной флоу.
            logger.warning(
                "Telegram-уведомление не доставлено chat_id=%s: %s",
                chat_id,
                data.get("description", "unknown"),
            )
    except Exception:  # pragma: no cover — отправка никогда не роняет флоу
        logger.warning(
            "Telegram-уведомление chat_id=%s: ошибка отправки",
            chat_id,
            exc_info=True,
        )


async def send_order_completed_telegrams(
    db: AsyncSession,
    order: MarketplaceOrder,
    *,
    blogger_share: int,
    worker_share: int,
    blogger_referral_share: int,
) -> None:
    """Telegram-рассылка по завершённому заказу: автор, воркер, блогер-реферер.

    Вызывается ПОСЛЕ распределения средств (distribute_funds); суммы — реальные
    доли из DistributionResult. Получатели загружаются одним запросом, chat id
    резолвится до create_task — фоновые таски БД не трогают.
    """
    recipient_ids = {order.blogger_id}
    if worker_share > 0 and order.worker_id is not None:
        recipient_ids.add(order.worker_id)
    if blogger_referral_share > 0 and order.blogger_referrer_id is not None:
        recipient_ids.add(order.blogger_referrer_id)

    result = await db.execute(select(User).where(User.id.in_(recipient_ids)))
    users = {u.id: u for u in result.scalars().all()}
    order_no = short_order_no(order.id)

    blogger = users.get(order.blogger_id)
    if blogger is not None:
        notify_user_telegram(
            blogger,
            f"Зачислено {format_rub(blogger_share)} за заказ №{order_no}. "
            f"Сделка завершена: {order_url(order.id)}",
        )

    if worker_share > 0 and order.worker_id is not None:
        worker = users.get(order.worker_id)
        if worker is not None:
            notify_user_telegram(
                worker,
                f"Ваша комиссия {format_rub(worker_share)} с заказа "
                f"приведённого клиента. Кабинет: {cabinet_url()}",
            )

    if blogger_referral_share > 0 and order.blogger_referrer_id is not None:
        referrer = users.get(order.blogger_referrer_id)
        if referrer is not None:
            notify_user_telegram(
                referrer,
                f"Реферальная комиссия {format_rub(blogger_referral_share)} "
                f"за заказ №{order_no}.",
            )
