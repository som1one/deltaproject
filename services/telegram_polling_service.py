"""Long polling Telegram-бота: сервер сам забирает апдейты.

Зачем. Вебхук требует, чтобы Telegram достучался до сервера снаружи, и на
этом хостинге входящее направление регулярно режется: fail2ban поднимает
свою цепочку выше правил ufw, так что белый список там не спасает. Симптом
— `getWebhookInfo` показывает растущий `pending_update_count` и
"Connection timed out", при том что та же точка снаружи отвечает мгновенно.
Бот в этот момент выглядит «упавшим», хотя приложение живо.

Исходящее направление при этом работает (через Cloudflare-воркер уходят и
уведомления, и проверка подписки). Поэтому апдейты забираем сами — входящие
соединения перестают быть нужны вообще.

**Поллить должен ровно один процесс.** Два параллельных `getUpdates` с одним
токеном воруют апдейты друг у друга: половина сообщений достанется чужому
процессу и будет потеряна. Поэтому режим включается явной переменной
TELEGRAM_BOT_POLLING и на локальных машинах остаётся выключенным — иначе
дев-запуск начнёт съедать апдейты продового бота.
"""

from __future__ import annotations

import asyncio
import json
import logging

from core.settings import settings
from services.telegram_channel_service import _bot_api_call

logger = logging.getLogger(__name__)

# Сколько Telegram держит соединение, ожидая новые апдейты.
_LONG_POLL_SECONDS = 25
# Клиент обязан ждать дольше сервера, иначе рвёт каждый пустой опрос.
_CLIENT_TIMEOUT_SECONDS = _LONG_POLL_SECONDS + 15
# Пауза после сбоя: сеть моргнула или Telegram ответил ошибкой.
_ERROR_BACKOFF_SECONDS = 5


async def _drop_webhook() -> bool:
    """Снять вебхук: с ним getUpdates отвечает 409 Conflict.

    `drop_pending_updates=false` — накопившаяся очередь нам нужна, там
    лежат непрочитанные /start от воркеров.
    """
    data = await _bot_api_call("deleteWebhook", {"drop_pending_updates": "false"})
    if data.get("ok"):
        logger.info("Long polling: вебхук снят, забираем апдейты сами")
        return True
    logger.warning(
        "Long polling: не удалось снять вебхук — %s",
        data.get("description", "unknown"),
    )
    return False


async def _process(update: dict) -> None:
    """Обработать один апдейт в собственной сессии БД.

    Импорт роутера ленивый: модуль роутера тянет сервисы, и импорт на
    уровне модуля замкнул бы цикл.
    """
    from core.database import get_session_factory
    from routers.telegram_bot import handle_update

    session_factory = get_session_factory()
    async with session_factory() as session:
        await handle_update(session, update)


async def run_polling() -> None:
    """Основной цикл: getUpdates → обработка → сдвиг offset.

    Offset живёт в памяти. При рестарте Telegram заново отдаёт всё, что не
    было подтверждено следующим запросом, — потери апдейтов не будет, но
    возможен повтор последнего. Обработчики к этому готовы: привязка чата
    идемпотентна, а команды только читают.
    """
    if not settings.telegram_oauth_bot_token.strip():
        logger.warning("Long polling: токен бота не задан — цикл не стартует")
        return

    await _drop_webhook()

    offset: int | None = None
    while True:
        params: dict = {
            "timeout": _LONG_POLL_SECONDS,
            "allowed_updates": json.dumps(["message"]),
        }
        if offset is not None:
            params["offset"] = offset

        try:
            data = await _bot_api_call(
                "getUpdates", params, timeout=_CLIENT_TIMEOUT_SECONDS
            )
        except Exception:  # pragma: no cover — цикл не имеет права умереть
            logger.exception("Long polling: сбой запроса getUpdates")
            await asyncio.sleep(_ERROR_BACKOFF_SECONDS)
            continue

        if not data.get("ok"):
            description = str(data.get("description", ""))
            # Кто-то переустановил вебхук — снимаем и продолжаем.
            if "conflict" in description.lower():
                logger.warning("Long polling: конфликт с вебхуком, снимаю повторно")
                await _drop_webhook()
            else:
                logger.warning("Long polling: getUpdates вернул %s", description)
            await asyncio.sleep(_ERROR_BACKOFF_SECONDS)
            continue

        updates = data.get("result") or []
        for update in updates:
            if not isinstance(update, dict):
                continue
            update_id = update.get("update_id")
            if isinstance(update_id, int):
                # Сдвигаем offset ДО обработки: битый апдейт не должен
                # вставать в бесконечный цикл переобработки.
                offset = update_id + 1
            try:
                await _process(update)
            except Exception:  # pragma: no cover
                logger.exception(
                    "Long polling: ошибка обработки апдейта %s", update_id
                )
