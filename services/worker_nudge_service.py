"""Управление воркерами через Telegram-бота: сегменты, рассылка, авто-пинки.

Три контура:

- **сегменты** (:func:`collect_worker_rows`, :func:`filter_segment`) — кто
  именно простаивает: никого не привёл, привёл но не заработал, давно не
  заходил, не подключил бота;
- **рассылка** (:func:`broadcast`) — доставка текста сегменту с троттлингом
  под лимиты Bot API и отчётом «доставлено / не дошло»;
- **авто-пинки** (:func:`run_auto_nudges`) — фоновый проход по триггерам с
  окном остывания, чтобы воркер не получал один и тот же пинок дважды.

Все отправки идут через бота уведомлений, к которому воркер подключился сам
(диплинк `/start <payload>` из кабинета). Не подключился — доставки нет,
это сегмент `offbot`, до него достукиваются другими каналами.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.user import User
from models.user_session import UserSession
from models.worker_nudge_log import WorkerNudgeLog
from services.telegram_channel_service import (
    _bot_api_call,
    check_user_subscribed,
    get_channel_config,
)
from services.telegram_notify_service import (
    cabinet_url,
    escape_html,
    format_rub,
    resolve_chat_id,
)

logger = logging.getLogger(__name__)

# Bot API разрешает ~30 сообщений в секунду разным адресатам. Держим запас:
# рассылка — не срочная операция, а словить 429 на половине списка неприятно.
_BROADCAST_DELAY_SECONDS = 0.06

# Сколько дней сегмент «молчит» считает молчанием по умолчанию.
DEFAULT_SILENT_DAYS = 7


@dataclass(frozen=True)
class WorkerRow:
    """Воркер со сводкой активности — строка ростера."""

    user: User
    referrals: int
    earnings_kopeks: int
    registered_at: datetime | None
    last_seen_at: datetime | None
    bot_connected: bool

    @property
    def days_since_registration(self) -> int | None:
        if self.registered_at is None:
            return None
        return (_now() - self.registered_at).days

    @property
    def days_silent(self) -> int | None:
        if self.last_seen_at is None:
            return None
        return (_now() - self.last_seen_at).days


@dataclass
class BroadcastReport:
    """Итог рассылки: кому ушло, кому нет и почему."""

    delivered: int = 0
    skipped_no_chat: int = 0
    failed: int = 0
    failures: list[str] | None = None

    def summary(self) -> str:
        parts = [f"доставлено {self.delivered}"]
        if self.skipped_no_chat:
            parts.append(f"без бота {self.skipped_no_chat}")
        if self.failed:
            parts.append(f"ошибок {self.failed}")
        return ", ".join(parts)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Сегменты ───────────────────────────────────────────────────────────────

# Ключ → человекочитаемое описание (используется в подсказке бота).
SEGMENTS: dict[str, str] = {
    "all": "все активные воркеры",
    "dead": "никого не привёл",
    "noearn": "привёл заказчиков, но ничего не заработал",
    "silent": f"не заходил {DEFAULT_SILENT_DAYS}+ дней",
    "offbot": "не подключил бота (до них рассылка не дойдёт)",
    "notinchannel": "подключил бота, но не подписан на канал",
}

# Сегменты, которые нельзя посчитать по БД — нужен опрос Bot API по каждому
# человеку. Отбираются отдельной async-функцией, а не filter_segment.
ASYNC_SEGMENTS: frozenset[str] = frozenset({"notinchannel"})


async def collect_worker_rows(db: AsyncSession) -> list[WorkerRow]:
    """Все активные воркеры со сводкой активности — одним запросом.

    Агрегаты считаются подзапросами (рефералы, заработок, первая и последняя
    сессия), поэтому фильтрация по сегментам дальше идёт в памяти: воркеров
    на площадке немного, а один проход по БД проще и предсказуемее, чем
    отдельный SQL под каждый сегмент.
    """
    referrals_sq = (
        select(
            User.marketplace_referred_by.label("worker_id"),
            func.count(User.id).label("cnt"),
        )
        .where(User.marketplace_referred_by.is_not(None))
        .group_by(User.marketplace_referred_by)
        .subquery()
    )

    earnings_sq = (
        select(
            MarketplaceEscrowEntry.user_id.label("worker_id"),
            func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0).label("total"),
        )
        .where(MarketplaceEscrowEntry.entry_type == "release_worker")
        .group_by(MarketplaceEscrowEntry.user_id)
        .subquery()
    )

    registered_sq = (
        select(
            UserSession.user_id.label("uid"),
            func.min(UserSession.created_at).label("registered_at"),
        )
        .where(UserSession.session_kind == "register")
        .group_by(UserSession.user_id)
        .subquery()
    )

    last_seen_sq = (
        select(
            UserSession.user_id.label("uid"),
            func.max(UserSession.created_at).label("last_seen_at"),
        )
        .group_by(UserSession.user_id)
        .subquery()
    )

    query = (
        select(
            User,
            referrals_sq.c.cnt,
            earnings_sq.c.total,
            registered_sq.c.registered_at,
            last_seen_sq.c.last_seen_at,
        )
        .outerjoin(referrals_sq, User.id == referrals_sq.c.worker_id)
        .outerjoin(earnings_sq, User.id == earnings_sq.c.worker_id)
        .outerjoin(registered_sq, User.id == registered_sq.c.uid)
        .outerjoin(last_seen_sq, User.id == last_seen_sq.c.uid)
        .where(User.role == UserRole.WORKER, User.is_active.is_(True))
    )

    rows = (await db.execute(query)).all()
    return [
        WorkerRow(
            user=row[0],
            referrals=int(row[1] or 0),
            earnings_kopeks=int(row[2] or 0),
            registered_at=row[3],
            last_seen_at=row[4],
            bot_connected=resolve_chat_id(row[0]) is not None,
        )
        for row in rows
    ]


def filter_segment(
    rows: list[WorkerRow],
    segment: str,
    *,
    silent_days: int = DEFAULT_SILENT_DAYS,
) -> list[WorkerRow]:
    """Отобрать воркеров сегмента. Неизвестный ключ → пустой список."""
    if segment == "all":
        return list(rows)
    if segment == "dead":
        return [r for r in rows if r.referrals == 0]
    if segment == "noearn":
        return [r for r in rows if r.referrals > 0 and r.earnings_kopeks == 0]
    if segment == "silent":
        return [
            r
            for r in rows
            if r.days_silent is not None and r.days_silent >= silent_days
        ]
    if segment == "offbot":
        return [r for r in rows if not r.bot_connected]
    return []


async def filter_not_in_channel(
    db: AsyncSession,
    rows: list[WorkerRow],
) -> list[WorkerRow]:
    """Кто из достижимых ботом ещё не подписан на канал.

    Требует запроса getChatMember на каждого — единственный сегмент, который
    стоит вызовов Bot API, поэтому и вынесен из синхронного filter_segment.
    Канал не настроен или выключен — считаем, что звать некуда, и возвращаем
    пустой список: лучше не разослать, чем разослать без ссылки.
    """
    config = await get_channel_config(db)
    if config is None or not config.channel_id:
        return []

    result: list[WorkerRow] = []
    for row in rows:
        if not row.bot_connected:
            continue
        chat_id = resolve_chat_id(row.user)
        if chat_id is None:
            continue
        try:
            subscribed = await check_user_subscribed(str(chat_id), config.channel_id)
        except Exception:  # pragma: no cover — сбой опроса не должен ронять сбор
            logger.warning(
                "Проверка подписки не удалась для user=%s", row.user.id, exc_info=True
            )
            continue
        if not subscribed:
            result.append(row)
    return result


async def channel_invite_line(db: AsyncSession) -> str:
    """Строка-приглашение в канал для текстов бота; пусто — канала нет.

    Канал пушится с каждого касания бота (приветствие, привязка, подсказка,
    авто-пинки): это единственный способ дотянуться до людей, которые уже
    в контуре, не тратя на них отдельную рассылку.
    """
    config = await get_channel_config(db)
    if config is None or not config.channel_url:
        return ""
    title = escape_html(config.channel_title or "канал площадки")
    return f"\n\nНовости и разборы сделок — в канале: {config.channel_url} ({title})"


def render_roster(rows: list[WorkerRow], *, limit: int = 20) -> str:
    """Сводка «кто чем занят» для админа — текст сообщения в бот."""
    if not rows:
        return "Активных воркеров нет."

    total = len(rows)
    dead = len(filter_segment(rows, "dead"))
    noearn = len(filter_segment(rows, "noearn"))
    silent = len(filter_segment(rows, "silent"))
    offbot = len(filter_segment(rows, "offbot"))
    earned = sum(r.earnings_kopeks for r in rows)
    referrals = sum(r.referrals for r in rows)

    lines = [
        f"<b>Воркеры: {total}</b>",
        f"Приведено заказчиков: {referrals} · заработано: {format_rub(earned)}",
        "",
        f"Никого не привёл: <b>{dead}</b>",
        f"Привёл, но 0 заработка: <b>{noearn}</b>",
        f"Молчит {DEFAULT_SILENT_DAYS}+ дней: <b>{silent}</b>",
        f"Без бота: <b>{offbot}</b>",
        "",
    ]

    # Сначала самые бесполезные: 0 рефералов и дольше всех в простое.
    ranked = sorted(
        rows,
        key=lambda r: (r.referrals, r.earnings_kopeks, -(r.days_silent or 0)),
    )
    lines.append(f"<b>Кто простаивает</b> (первые {min(limit, total)}):")
    for row in ranked[:limit]:
        silent_mark = f"{row.days_silent}д" if row.days_silent is not None else "—"
        bot_mark = "" if row.bot_connected else " ⚠️без бота"
        lines.append(
            f"· {escape_html(row.user.name)} — реф {row.referrals}, "
            f"{format_rub(row.earnings_kopeks)}, тишина {silent_mark}{bot_mark}"
        )

    return "\n".join(lines)


# ─── Рассылка ───────────────────────────────────────────────────────────────

async def broadcast(rows: list[WorkerRow], text: str) -> BroadcastReport:
    """Разослать текст воркерам сегмента, дождавшись результата доставки.

    В отличие от `notify_user_telegram` (fire-and-forget по ходу бизнес-флоу)
    здесь важен отчёт: админ должен видеть, до скольких людей реально дошло.
    Отправка последовательная с паузой — Bot API не любит всплески.
    """
    report = BroadcastReport(failures=[])

    for row in rows:
        chat_id = resolve_chat_id(row.user)
        if chat_id is None:
            report.skipped_no_chat += 1
            continue
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
        except Exception:  # pragma: no cover — сеть не должна ронять рассылку
            logger.warning("Рассылка: сбой отправки %s", row.user.name, exc_info=True)
            report.failed += 1
            continue

        if data.get("ok"):
            report.delivered += 1
        else:
            report.failed += 1
            if report.failures is not None and len(report.failures) < 10:
                report.failures.append(
                    f"{row.user.name}: {data.get('description', 'unknown')}"
                )
        await asyncio.sleep(_BROADCAST_DELAY_SECONDS)

    return report


# ─── Авто-пинки ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class NudgeKind:
    """Триггер авто-пинка: когда срабатывает и что пишем."""

    key: str
    cooldown_days: int
    text: str


AUTO_NUDGES: tuple[NudgeKind, ...] = (
    NudgeKind(
        key="no_referrals",
        cooldown_days=7,
        text=(
            "Вы зарегистрировались как воркер, но пока не привели ни одного "
            "заказчика. Заработок идёт с процента от их заказов — пока нет "
            "приведённых, нет и денег.\n\n"
            "Возьмите свою ссылку и готовые скрипты в кабинете: {cabinet}"
        ),
    ),
    NudgeKind(
        key="no_orders",
        cooldown_days=14,
        text=(
            "У вас есть приведённые заказчики, но ни один пока не оформил "
            "заказ. Обычно помогает написать им напрямую — напомнить про "
            "площадку и подобрать автора под их товар.\n\n"
            "Скрипты и список приведённых — в кабинете: {cabinet}"
        ),
    ),
    NudgeKind(
        key="silent",
        cooldown_days=14,
        text=(
            "Вас давно не было на площадке. Заказчики приходят и уходят, "
            "а комиссия капает только тем, кто в контуре.\n\n"
            "Зайдите и заберите свою ссылку: {cabinet}"
        ),
    ),
)


def _select_nudge(row: WorkerRow) -> NudgeKind | None:
    """Какой пинок положен воркеру прямо сейчас (первый подходящий)."""
    days_registered = row.days_since_registration
    days_silent = row.days_silent

    if row.referrals == 0 and days_registered is not None and days_registered >= 3:
        return AUTO_NUDGES[0]
    if row.referrals > 0 and row.earnings_kopeks == 0:
        return AUTO_NUDGES[1]
    if days_silent is not None and days_silent >= DEFAULT_SILENT_DAYS:
        return AUTO_NUDGES[2]
    return None


async def _recently_nudged(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: str,
    cooldown_days: int,
) -> bool:
    """Уходил ли такой пинок этому воркеру внутри окна остывания."""
    cutoff = _now() - timedelta(days=cooldown_days)
    stmt = select(func.count(WorkerNudgeLog.id)).where(
        WorkerNudgeLog.user_id == user_id,
        WorkerNudgeLog.kind == kind,
        WorkerNudgeLog.sent_at >= cutoff,
    )
    return int((await db.execute(stmt)).scalar_one()) > 0


async def run_auto_nudges(db: AsyncSession) -> int:
    """Один проход авто-пинков. Возвращает количество отправленных.

    Воркеру уходит максимум один пинок за проход — самый релевантный.
    Отправленное пишется в `worker_nudge_log`, поэтому повтор невозможен
    раньше, чем через `cooldown_days` соответствующего триггера.
    """
    rows = await collect_worker_rows(db)
    invite = await channel_invite_line(db)
    sent = 0

    for row in rows:
        if not row.bot_connected:
            continue
        nudge = _select_nudge(row)
        if nudge is None:
            continue
        if await _recently_nudged(db, row.user.id, nudge.key, nudge.cooldown_days):
            continue

        chat_id = resolve_chat_id(row.user)
        if chat_id is None:
            continue

        text = nudge.text.format(cabinet=cabinet_url()) + invite
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
        except Exception:  # pragma: no cover
            logger.warning(
                "Авто-пинок %s: сбой отправки user=%s", nudge.key, row.user.id,
                exc_info=True,
            )
            continue

        if not data.get("ok"):
            logger.info(
                "Авто-пинок %s не доставлен user=%s: %s",
                nudge.key,
                row.user.id,
                data.get("description", "unknown"),
            )
            continue

        db.add(WorkerNudgeLog(user_id=row.user.id, kind=nudge.key))
        sent += 1
        await asyncio.sleep(_BROADCAST_DELAY_SECONDS)

    if sent:
        await db.commit()
    else:
        await db.rollback()
    return sent
