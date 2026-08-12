"""Вебхук Telegram-бота: привязка чата, команды воркера и пульт админа.

Бот работает без JWT — собеседник опознаётся по chat_id, который воркер сам
привязал диплинком `/start <payload>` из кабинета. Роль берётся из БД, так
что админские команды видит только владелец админского аккаунта, привязавший
свой чат тем же способом.

Рассылка (`/push`) двухшаговая: первая команда собирает сегмент и показывает
превью, отправка уходит только после явного `/push_confirm`. Опечатка в
тексте не должна улетать людям.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from services import worker_nudge_service
from services.marketplace_referral_service import generate_referral_link
from services.telegram_channel_service import _bot_api_call
from services.telegram_notify_service import (
    cabinet_url,
    escape_html,
    format_rub,
    verify_connect_payload,
)
from services.worker_dashboard_service import get_stats
from services.worker_message_script_service import list_worker_scripts_public

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_CONNECTED_TEXT = (
    "Уведомления подключены. Сюда будут приходить события "
    "по вашим сделкам и комиссиям.\n\n"
    "Команды: /stats — ваши цифры, /ref — реферальная ссылка, "
    "/scripts — заготовки сообщений."
)
def _greeting_text() -> str:
    """Приветствие на голый /start — обязательно со ссылкой в кабинет.

    Пришедший не по диплинку упирается в тупик: привязать чат можно только
    кнопкой из кабинета, а как туда попасть — из текста непонятно. Ссылка
    строится в рантайме, чтобы следовать за MAIN_FRONTEND_URL.
    """
    return (
        "Это бот площадки moneymaxxxing: уведомления по сделкам, оплатам "
        "и комиссиям.\n\n"
        "Чтобы подключить их, откройте кабинет и нажмите «Подключить "
        "Telegram» — кнопка выдаст персональную ссылку, и мы поймём, "
        "чей это чат.\n\n"
        f"Кабинет: {cabinet_url()}"
    )
def _unknown_user_text() -> str:
    """Ответ на команду из чата, который ни к кому не привязан."""
    return (
        "Не вижу привязки этого чата к аккаунту. Откройте кабинет и нажмите "
        "«Подключить Telegram» — кнопка выдаст персональную ссылку.\n\n"
        f"Кабинет: {cabinet_url()}"
    )

# Черновики рассылок живут в памяти процесса: подтверждение занимает секунды,
# а перезапуск в худшем случае заставит админа повторить команду.
_PUSH_TTL_SECONDS = 600


@dataclass
class PendingPush:
    """Черновик рассылки, ждущий /push_confirm."""

    segment: str
    text: str
    recipient_ids: list = field(default_factory=list)
    created_at: float = field(default_factory=time.monotonic)

    def is_expired(self) -> bool:
        return time.monotonic() - self.created_at > _PUSH_TTL_SECONDS


_pending_pushes: dict[int, PendingPush] = {}


@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_telegram_secret: Annotated[
        str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")
    ] = None,
    secret: Annotated[str | None, Query()] = None,
) -> dict[str, bool]:
    """Обработка апдейтов бота: привязка чата и команды.

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

    try:
        await _dispatch(db=db, chat_id=chat_id, text=text.strip())
    except Exception:  # pragma: no cover — апдейт всегда подтверждаем
        logger.exception("Telegram webhook: ошибка обработки chat_id=%s", chat_id)

    return {"ok": True}


# ─── Диспетчер ──────────────────────────────────────────────────────────────

async def _dispatch(*, db: AsyncSession, chat_id: int, text: str) -> None:
    """Разобрать сообщение и выполнить команду."""
    if text == "/start":
        await _reply(chat_id, _greeting_text())
        return

    if text.startswith("/start "):
        await _handle_connect(
            db=db, chat_id=chat_id, payload=text[len("/start "):].strip()
        )
        return

    if not text.startswith("/"):
        return

    command, _, argument = text.partition(" ")
    # Telegram дописывает @botname при обращении в группе.
    command = command.split("@", 1)[0].lower()
    argument = argument.strip()

    user = await _resolve_user(db, chat_id)
    if user is None:
        await _reply(chat_id, _unknown_user_text())
        return

    is_admin = user.role in (UserRole.ADMIN, UserRole.TECH_ADMIN)

    if command == "/help":
        await _reply(chat_id, _help_text(is_admin=is_admin))
    elif command == "/stats":
        await _handle_stats(db=db, chat_id=chat_id, user=user)
    elif command == "/ref":
        await _handle_ref(db=db, chat_id=chat_id, user=user)
    elif command == "/scripts":
        await _handle_scripts(db=db, chat_id=chat_id)
    elif command == "/roster" and is_admin:
        await _handle_roster(db=db, chat_id=chat_id)
    elif command == "/segments" and is_admin:
        await _reply(chat_id, _segments_text())
    elif command == "/push" and is_admin:
        await _handle_push(db=db, chat_id=chat_id, argument=argument)
    elif command == "/push_confirm" and is_admin:
        await _handle_push_confirm(db=db, chat_id=chat_id)
    elif command == "/push_cancel" and is_admin:
        _pending_pushes.pop(chat_id, None)
        await _reply(chat_id, "Черновик рассылки отменён.")
    else:
        await _reply(chat_id, _help_text(is_admin=is_admin))


async def _resolve_user(db: AsyncSession, chat_id: int) -> User | None:
    """Аккаунт по chat_id: явная привязка или синтетический telegram-email.

    Синтетические адреса (`tg_<id>@…`, `tg_client_<id>@…`) заводит
    telegram_user_service при входе через Telegram — у таких аккаунтов
    telegram_chat_id может быть пуст, но чат всё равно наш.
    """
    stmt = select(User).where(
        or_(
            User.telegram_chat_id == chat_id,
            User.email.like(f"tg_{chat_id}@%"),
            User.email.like(f"tg_client_{chat_id}@%"),
        )
    )
    return (await db.execute(stmt)).scalars().first()


async def _handle_connect(*, db: AsyncSession, chat_id: int, payload: str) -> None:
    user_id = verify_connect_payload(payload)
    if user_id is None:
        logger.warning(
            "Telegram webhook: битый payload диплинка от chat_id=%s", chat_id
        )
        return
    user = await db.get(User, user_id)
    if user is None:
        return
    user.telegram_chat_id = chat_id
    await db.commit()
    await _reply(chat_id, _CONNECTED_TEXT)


# ─── Команды пользователя ───────────────────────────────────────────────────

def _help_text(*, is_admin: bool) -> str:
    lines = [
        "<b>Команды</b>",
        "/stats — ваши цифры: баланс, заработок, рефералы",
        "/ref — ваша реферальная ссылка",
        "/scripts — заготовки сообщений заказчикам",
    ]
    if is_admin:
        lines += [
            "",
            "<b>Админ</b>",
            "/roster — кто из воркеров простаивает",
            "/segments — какие сегменты есть",
            "/push &lt;сегмент&gt; &lt;текст&gt; — подготовить рассылку",
            "/push_confirm — отправить подготовленную",
            "/push_cancel — отменить черновик",
        ]
    return "\n".join(lines)


async def _handle_stats(*, db: AsyncSession, chat_id: int, user: User) -> None:
    if user.role != UserRole.WORKER:
        await _reply(chat_id, "Команда для воркеров.")
        return
    stats = await get_stats(db, user.id)
    await _reply(
        chat_id,
        "<b>Ваши цифры</b>\n"
        f"Баланс: {format_rub(stats.balance_kopeks)}\n"
        f"Заработано всего: {format_rub(stats.total_earnings_kopeks)}\n"
        f"Приведено заказчиков: {stats.referral_count}\n\n"
        f"Кабинет: {cabinet_url()}",
    )


async def _handle_ref(*, db: AsyncSession, chat_id: int, user: User) -> None:
    if user.role != UserRole.WORKER:
        await _reply(chat_id, "Реферальная ссылка выдаётся воркерам.")
        return
    url = await generate_referral_link(user.id, db)
    await _reply(
        chat_id,
        "<b>Ваша реферальная ссылка</b>\n"
        f"{url}\n\n"
        "Заказчик, пришедший по ней, закрепляется за вами навсегда — "
        "процент капает с каждого его заказа.",
    )


async def _handle_scripts(*, db: AsyncSession, chat_id: int) -> None:
    scripts = await list_worker_scripts_public(db)
    if not scripts:
        await _reply(chat_id, "Скриптов пока нет.")
        return
    lines = ["<b>Заготовки сообщений</b>", ""]
    for script in scripts[:5]:
        lines.append(f"<b>{escape_html(script.title)}</b>")
        lines.append(escape_html(script.body))
        lines.append("")
    if len(scripts) > 5:
        lines.append(f"Ещё {len(scripts) - 5} — в кабинете: {cabinet_url()}")
    await _reply(chat_id, "\n".join(lines))


# ─── Админский пульт ────────────────────────────────────────────────────────

def _segments_text() -> str:
    lines = ["<b>Сегменты для /push</b>", ""]
    for key, description in worker_nudge_service.SEGMENTS.items():
        lines.append(f"<code>{key}</code> — {description}")
    lines += [
        "",
        "Пример: <code>/push dead Ребята, ссылка сама себя не разошлёт</code>",
    ]
    return "\n".join(lines)


async def _handle_roster(*, db: AsyncSession, chat_id: int) -> None:
    rows = await worker_nudge_service.collect_worker_rows(db)
    await _reply(chat_id, worker_nudge_service.render_roster(rows))


async def _handle_push(*, db: AsyncSession, chat_id: int, argument: str) -> None:
    segment, _, body = argument.partition(" ")
    segment = segment.strip().lower()
    body = body.strip()

    if not segment or not body:
        await _reply(
            chat_id,
            "Формат: <code>/push &lt;сегмент&gt; &lt;текст&gt;</code>\n\n"
            + _segments_text(),
        )
        return
    if segment not in worker_nudge_service.SEGMENTS:
        await _reply(
            chat_id,
            f"Неизвестный сегмент <code>{escape_html(segment)}</code>.\n\n"
            + _segments_text(),
        )
        return

    rows = await worker_nudge_service.collect_worker_rows(db)
    if segment in worker_nudge_service.ASYNC_SEGMENTS:
        targets = await worker_nudge_service.filter_not_in_channel(db, rows)
    else:
        targets = worker_nudge_service.filter_segment(rows, segment)
    reachable = [row for row in targets if row.bot_connected]

    if not reachable:
        await _reply(
            chat_id,
            f"В сегменте <code>{escape_html(segment)}</code> некому писать: "
            f"подходит {len(targets)}, из них с подключённым ботом 0.",
        )
        return

    _pending_pushes[chat_id] = PendingPush(
        segment=segment,
        text=body,
        recipient_ids=[row.user.id for row in reachable],
    )

    preview_names = ", ".join(escape_html(row.user.name) for row in reachable[:8])
    if len(reachable) > 8:
        preview_names += f" и ещё {len(reachable) - 8}"

    await _reply(
        chat_id,
        f"<b>Черновик рассылки</b>\n"
        f"Сегмент: <code>{escape_html(segment)}</code> — "
        f"{worker_nudge_service.SEGMENTS[segment]}\n"
        f"Получателей: <b>{len(reachable)}</b> (из {len(targets)} в сегменте)\n"
        f"Кому: {preview_names}\n\n"
        f"<b>Текст:</b>\n{escape_html(body)}\n\n"
        f"Отправить — /push_confirm, отменить — /push_cancel.",
    )


async def _handle_push_confirm(*, db: AsyncSession, chat_id: int) -> None:
    pending = _pending_pushes.get(chat_id)
    if pending is None:
        await _reply(
            chat_id, "Нет черновика. Сначала /push &lt;сегмент&gt; &lt;текст&gt;."
        )
        return
    if pending.is_expired():
        _pending_pushes.pop(chat_id, None)
        await _reply(chat_id, "Черновик протух (больше 10 минут). Соберите заново.")
        return

    _pending_pushes.pop(chat_id, None)

    users = (
        await db.execute(select(User).where(User.id.in_(pending.recipient_ids)))
    ).scalars().all()
    rows = [
        worker_nudge_service.WorkerRow(
            user=user,
            referrals=0,
            earnings_kopeks=0,
            registered_at=None,
            last_seen_at=None,
            bot_connected=True,
        )
        for user in users
    ]

    await _reply(chat_id, f"Отправляю {len(rows)}…")
    report = await worker_nudge_service.broadcast(rows, pending.text)

    summary = f"<b>Рассылка ушла.</b> {report.summary()}"
    if report.failures:
        summary += "\n\nНе дошло:\n" + "\n".join(
            escape_html(failure) for failure in report.failures
        )
    await _reply(chat_id, summary)


async def _reply(chat_id: int, text: str) -> None:
    """Ответ юзеру в чат; сбой отправки не ломает обработку апдейта."""
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
        logger.warning(
            "Telegram webhook: не удалось ответить chat_id=%s: %s",
            chat_id,
            data.get("description", "unknown"),
        )
