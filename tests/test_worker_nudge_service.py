"""Тесты управления воркерами через бота: сегменты, ростер, авто-пинки.

Покрывают чистую логику отбора (какой воркер в каком сегменте, какой пинок
ему положен) и рендер сводки. Отправка в Telegram и запросы к БД здесь не
трогаются — они за границей этих функций.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from enums.user import UserRole
from models.user import User
from routers import telegram_bot
from routers.telegram_bot import PendingPush
from services.worker_nudge_service import (
    ASYNC_SEGMENTS,
    DEFAULT_SILENT_DAYS,
    SEGMENTS,
    BroadcastReport,
    WorkerRow,
    _select_nudge,
    default_rule_map,
    filter_segment,
    render_roster,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _worker(name: str = "Воркер", chat_id: int | None = 100500) -> User:
    return User(
        id=uuid.uuid4(),
        name=name,
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        hash_pass="x",
        role=UserRole.WORKER,
        telegram_chat_id=chat_id,
    )


def _row(
    *,
    name: str = "Воркер",
    referrals: int = 0,
    earnings: int = 0,
    registered_days_ago: int | None = 30,
    silent_days: int | None = 0,
    bot: bool = True,
) -> WorkerRow:
    return WorkerRow(
        user=_worker(name, chat_id=100500 if bot else None),
        referrals=referrals,
        earnings_kopeks=earnings,
        registered_at=(
            _now() - timedelta(days=registered_days_ago)
            if registered_days_ago is not None
            else None
        ),
        last_seen_at=(
            _now() - timedelta(days=silent_days) if silent_days is not None else None
        ),
        bot_connected=bot,
    )


class TestSegments:
    """Отбор воркеров по сегментам."""

    def test_dead_is_zero_referrals(self) -> None:
        rows = [_row(name="пустой", referrals=0), _row(name="рабочий", referrals=3)]
        selected = filter_segment(rows, "dead")
        assert [r.user.name for r in selected] == ["пустой"]

    def test_noearn_requires_referrals_without_money(self) -> None:
        rows = [
            _row(name="привёл-но-ноль", referrals=2, earnings=0),
            _row(name="никого", referrals=0, earnings=0),
            _row(name="заработал", referrals=2, earnings=50_000),
        ]
        selected = filter_segment(rows, "noearn")
        assert [r.user.name for r in selected] == ["привёл-но-ноль"]

    def test_silent_uses_threshold(self) -> None:
        rows = [
            _row(name="вчера", silent_days=1),
            _row(name="давно", silent_days=DEFAULT_SILENT_DAYS + 2),
        ]
        selected = filter_segment(rows, "silent")
        assert [r.user.name for r in selected] == ["давно"]

    def test_silent_ignores_workers_without_sessions(self) -> None:
        """Нет ни одной сессии — молчание посчитать не из чего, не пинаем."""
        rows = [_row(name="без-сессий", silent_days=None)]
        assert filter_segment(rows, "silent") == []

    def test_offbot_selects_unreachable(self) -> None:
        rows = [_row(name="с ботом", bot=True), _row(name="без бота", bot=False)]
        selected = filter_segment(rows, "offbot")
        assert [r.user.name for r in selected] == ["без бота"]

    def test_all_returns_everyone(self) -> None:
        rows = [_row(), _row(), _row()]
        assert len(filter_segment(rows, "all")) == 3

    def test_unknown_segment_is_empty(self) -> None:
        assert filter_segment([_row()], "какой-то") == []

    def test_every_documented_segment_is_implemented(self) -> None:
        """Ключ в SEGMENTS без реализации молча вернул бы пустую рассылку.

        Async-сегменты (опрос Bot API) сюда не входят — их отбирает
        отдельная функция, filter_segment для них всегда пуст.
        """
        rows = [
            _row(referrals=0, silent_days=DEFAULT_SILENT_DAYS + 1, bot=False),
            _row(referrals=2, earnings=0),
        ]
        for key in SEGMENTS:
            if key in ASYNC_SEGMENTS:
                continue
            assert filter_segment(rows, key), f"сегмент {key} ничего не отобрал"

    def test_async_segments_are_documented(self) -> None:
        """Иначе сегмент есть в коде, но его не видно в /segments."""
        assert ASYNC_SEGMENTS <= set(SEGMENTS)


class TestAutoNudgeSelection:
    """Какой пинок положен воркеру."""

    def test_fresh_worker_is_not_nudged(self) -> None:
        """Первые три дня не трогаем — человек ещё разбирается."""
        assert _select_nudge(_row(referrals=0, registered_days_ago=1), default_rule_map()) is None

    def test_no_referrals_after_three_days(self) -> None:
        nudge = _select_nudge(_row(referrals=0, registered_days_ago=5), default_rule_map())
        assert nudge is not None and nudge.kind == "no_referrals"

    def test_referrals_without_money_gets_no_orders(self) -> None:
        nudge = _select_nudge(_row(referrals=4, earnings=0), default_rule_map())
        assert nudge is not None and nudge.kind == "no_orders"

    def test_silence_nudge_for_earning_worker(self) -> None:
        nudge = _select_nudge(
            _row(referrals=2, earnings=90_000, silent_days=DEFAULT_SILENT_DAYS + 1),
            default_rule_map(),
        )
        assert nudge is not None and nudge.kind == "silent"

    def test_active_earning_worker_is_left_alone(self) -> None:
        assert _select_nudge(_row(referrals=3, earnings=120_000, silent_days=0), default_rule_map()) is None

    @pytest.mark.parametrize("registered_days_ago", [None, 0, 2])
    def test_no_referrals_needs_known_registration_age(
        self, registered_days_ago: int | None
    ) -> None:
        row = _row(referrals=0, registered_days_ago=registered_days_ago, silent_days=0)
        nudge = _select_nudge(row, default_rule_map())
        assert nudge is None or nudge.kind != "no_referrals"

    def test_disabled_rule_is_skipped(self) -> None:
        """Выключенный в админке триггер не должен срабатывать."""
        rules = default_rule_map()
        rules["no_referrals"].is_enabled = False
        assert _select_nudge(_row(referrals=0, registered_days_ago=30, silent_days=0), rules) is None

    def test_disabled_rule_does_not_block_the_next_one(self) -> None:
        """Выключение одного триггера не должно глушить остальные."""
        rules = default_rule_map()
        rules["no_referrals"].is_enabled = False
        row = _row(
            referrals=0,
            registered_days_ago=30,
            silent_days=DEFAULT_SILENT_DAYS + 1,
        )
        nudge = _select_nudge(row, rules)
        assert nudge is not None and nudge.kind == "silent"

    def test_threshold_comes_from_the_rule_not_from_code(self) -> None:
        """Порог правится в админке — хардкод 3 дня больше не действует."""
        rules = default_rule_map()
        rules["no_referrals"].threshold_days = 30
        assert _select_nudge(_row(referrals=0, registered_days_ago=10), rules) is None

        rules["no_referrals"].threshold_days = 1
        nudge = _select_nudge(_row(referrals=0, registered_days_ago=10), rules)
        assert nudge is not None and nudge.kind == "no_referrals"

    def test_rule_carries_its_own_text(self) -> None:
        """Отправка берёт текст из правила, а не из кодовой константы."""
        rules = default_rule_map()
        rules["no_referrals"].text_template = "Новый текст {cabinet}"
        nudge = _select_nudge(_row(referrals=0, registered_days_ago=10), rules)
        assert nudge is not None
        assert nudge.text_template == "Новый текст {cabinet}"


class TestRoster:
    """Сводка для админа."""

    def test_empty_roster(self) -> None:
        assert render_roster([]) == "Активных воркеров нет."

    def test_counts_and_slackers_first(self) -> None:
        rows = [
            _row(name="звезда", referrals=9, earnings=500_000),
            _row(name="балласт", referrals=0),
        ]
        text = render_roster(rows)
        assert "Воркеры: 2" in text
        assert "Никого не привёл: <b>1</b>" in text
        # Простаивающий должен идти раньше результативного.
        assert text.index("балласт") < text.index("звезда")

    def test_escapes_names(self) -> None:
        """Имя с угловыми скобками не должно ломать parse_mode=HTML."""
        text = render_roster([_row(name="<b>взлом</b>")])
        assert "&lt;b&gt;взлом&lt;/b&gt;" in text

    def test_marks_workers_without_bot(self) -> None:
        assert "без бота" in render_roster([_row(name="глухой", bot=False)])


class TestBroadcastReport:
    def test_summary_mentions_only_relevant_counters(self) -> None:
        assert BroadcastReport(delivered=5).summary() == "доставлено 5"

    def test_summary_lists_problems(self) -> None:
        summary = BroadcastReport(delivered=2, skipped_no_chat=1, failed=3).summary()
        assert "доставлено 2" in summary
        assert "без бота 1" in summary
        assert "ошибок 3" in summary


class TestPendingPush:
    def test_fresh_draft_is_alive(self) -> None:
        assert PendingPush(segment="dead", text="подъём").is_expired() is False

    def test_stale_draft_expires(self) -> None:
        draft = PendingPush(segment="dead", text="подъём")
        draft.created_at -= 601
        assert draft.is_expired() is True


class TestDispatchAccess:
    """Разграничение команд бота по роли.

    Собеседник опознаётся только по chat_id, поэтому проверка роли в
    диспетчере — единственное, что отделяет воркера от пульта рассылки.
    """

    @pytest.fixture
    def replies(self, monkeypatch: pytest.MonkeyPatch) -> list[str]:
        sent: list[str] = []

        async def fake_reply(chat_id: int, text: str) -> None:
            sent.append(text)

        monkeypatch.setattr(telegram_bot, "_reply", fake_reply)
        return sent

    async def _run(
        self,
        monkeypatch: pytest.MonkeyPatch,
        user: User | None,
        text: str,
    ) -> None:
        async def fake_resolve(db: object, chat_id: int) -> User | None:
            return user

        monkeypatch.setattr(telegram_bot, "_resolve_user", fake_resolve)
        await telegram_bot._dispatch(db=None, chat_id=1, text=text)

    @pytest.mark.asyncio
    async def test_worker_cannot_push(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        called = False

        async def boom(**kwargs: object) -> None:
            nonlocal called
            called = True

        monkeypatch.setattr(telegram_bot, "_handle_push", boom)
        await self._run(monkeypatch, _worker(), "/push all срочно все работать")

        assert called is False, "воркер не должен запускать рассылку"
        assert replies and "Админ" not in replies[0]

    @pytest.mark.asyncio
    async def test_worker_help_hides_admin_commands(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        await self._run(monkeypatch, _worker(), "/help")
        assert "/push" not in replies[0]
        assert "/stats" in replies[0]

    @pytest.mark.asyncio
    async def test_admin_help_lists_console(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        admin = _worker(name="Platform")
        admin.role = UserRole.ADMIN
        await self._run(monkeypatch, admin, "/help")
        assert "/push" in replies[0]
        assert "/roster" in replies[0]

    @pytest.mark.asyncio
    async def test_unbound_chat_gets_cabinet_link(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        """Без ссылки человек в тупике: кнопка привязки живёт в кабинете."""
        await self._run(monkeypatch, None, "/stats")
        assert "Подключить Telegram" in replies[0]
        assert "/cabinet" in replies[0]

    @pytest.mark.asyncio
    async def test_bare_start_gives_cabinet_link(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        """Пришёл в бота не по диплинку — всё равно должен знать, куда идти."""
        await self._run(monkeypatch, None, "/start")
        assert "/cabinet" in replies[0]

    @pytest.mark.asyncio
    async def test_plain_text_is_ignored(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        await self._run(monkeypatch, _worker(), "привет")
        assert replies == []

    @pytest.mark.asyncio
    async def test_command_with_bot_suffix_is_recognized(
        self, monkeypatch: pytest.MonkeyPatch, replies: list[str]
    ) -> None:
        """В группах Telegram присылает /help@looneymoonbot."""
        await self._run(monkeypatch, _worker(), "/help@looneymoonbot")
        assert "/stats" in replies[0]
