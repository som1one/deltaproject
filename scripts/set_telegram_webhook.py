"""Регистрация вебхука Telegram-бота уведомлений (setWebhook + getWebhookInfo).

Запуск из корня репозитория:

    python scripts/set_telegram_webhook.py [--url https://…/api/webhooks/telegram?secret=…]

По умолчанию url ведёт на прод-маркетплейс с секретом из
TELEGRAM_BOT_WEBHOOK_SECRET; тот же секрет ставится в secret_token —
вебхук принимает любой из двух способов (query или заголовок
X-Telegram-Bot-Api-Secret-Token).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.settings import settings  # noqa: E402
from services.telegram_channel_service import _bot_api_call  # noqa: E402


def default_webhook_url(secret: str) -> str:
    return f"https://marketplace.moneymaxxxing.ru/api/webhooks/telegram?secret={secret}"


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="setWebhook для Telegram-бота уведомлений"
    )
    parser.add_argument(
        "--url",
        default=None,
        help="URL вебхука (по умолчанию — прод-маркетплейс с ?secret=…)",
    )
    args = parser.parse_args()

    secret = settings.telegram_bot_webhook_secret_effective
    if not secret:
        print(
            "Секрет вебхука пуст (нет ни TELEGRAM_BOT_WEBHOOK_SECRET, ни "
            "JWT_SECRET_KEY) — вебхук будет отвечать 403. Задайте и повторите.",
            file=sys.stderr,
        )
        return 1

    url = args.url or default_webhook_url(secret)
    result = await _bot_api_call(
        "setWebhook",
        {
            "url": url,
            "secret_token": secret,
            # Обязательно явно: иначе Telegram сохранит прежний фильтр
            # (у бота исторически стоял ["channel_post","my_chat_member"]),
            # и /start до вебхука не дойдёт.
            "allowed_updates": json.dumps(["message"]),
        },
    )
    print("setWebhook:", json.dumps(result, ensure_ascii=False, indent=2))

    # Меню команд в клиенте: без него воркер не узнает, что бот умеет
    # больше, чем присылать уведомления. Админские команды сюда не
    # добавляем — они не должны маячить у всех подряд.
    commands = await _bot_api_call(
        "setMyCommands",
        {
            "commands": json.dumps(
                [
                    {"command": "stats", "description": "Мои цифры: баланс и заработок"},
                    {"command": "ref", "description": "Моя реферальная ссылка"},
                    {"command": "scripts", "description": "Заготовки сообщений"},
                    {"command": "help", "description": "Что умеет бот"},
                ],
                ensure_ascii=False,
            )
        },
    )
    print("setMyCommands:", json.dumps(commands, ensure_ascii=False, indent=2))

    info = await _bot_api_call("getWebhookInfo", {})
    print("getWebhookInfo:", json.dumps(info, ensure_ascii=False, indent=2))

    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
