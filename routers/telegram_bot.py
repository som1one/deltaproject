"""Вебхук Telegram-бота: привязка чата для уведомлений (без JWT)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from dependencies.database import get_db
from models.user import User
from services.telegram_channel_service import _bot_api_call
from services.telegram_notify_service import verify_connect_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_CONNECTED_TEXT = (
    "Уведомления подключены. Сюда будут приходить события "
    "по вашим сделкам и комиссиям."
)
_GREETING_TEXT = (
    "Это бот уведомлений площадки moneymaxxxing: сделки, оплаты, комиссии. "
    "Чтобы подключить уведомления, откройте кнопку «Подключить Telegram» "
    "в вашем кабинете — она выдаст персональную ссылку."
)


@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_telegram_secret: Annotated[
        str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")
    ] = None,
    secret: Annotated[str | None, Query()] = None,
) -> dict[str, bool]:
    """Обработка апдейтов бота: только /start [payload], остальное игнорируется.

    Защита как у вебхука ЮKassa: секрет query-параметром или заголовком
    (setWebhook умеет secret_token). Пустой секрет в конфиге = вебхук
    выключен. На любой обработанный апдейт отвечаем 200 {"ok": true} —
    иначе Telegram будет ретраить его бесконечно.
    """
    expected = settings.telegram_bot_webhook_secret_effective
    if not expected or (x_telegram_secret != expected and secret != expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    try:
        body = await request.json()
    except Exception:
        return {"ok": True}
    if not isinstance(body, dict):
        return {"ok": True}

    message = body.get("message")
    if not isinstance(message, dict):
        return {"ok": True}
    text = message.get("text")
    chat = message.get("chat")
    if not isinstance(text, str) or not isinstance(chat, dict):
        return {"ok": True}
    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return {"ok": True}

    text = text.strip()
    if text == "/start":
        await _reply(chat_id, _GREETING_TEXT)
        return {"ok": True}

    if text.startswith("/start "):
        payload = text[len("/start "):].strip()
        user_id = verify_connect_payload(payload)
        if user_id is None:
            logger.warning(
                "Telegram webhook: битый payload диплинка от chat_id=%s", chat_id
            )
            return {"ok": True}
        user = await db.get(User, user_id)
        if user is None:
            return {"ok": True}
        user.telegram_chat_id = chat_id
        await db.commit()
        await _reply(chat_id, _CONNECTED_TEXT)
        return {"ok": True}

    # Прочие сообщения бот молча игнорирует
    return {"ok": True}


async def _reply(chat_id: int, text: str) -> None:
    """Ответ юзеру в чат; сбой отправки не ломает обработку апдейта."""
    data = await _bot_api_call("sendMessage", {"chat_id": chat_id, "text": text})
    if not data.get("ok"):
        logger.warning(
            "Telegram webhook: не удалось ответить chat_id=%s: %s",
            chat_id,
            data.get("description", "unknown"),
        )
