import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn

from core.settings import settings

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.database import dispose_db, init_db
from core.logging import setup_logging
from core.rate_limit import limiter
from services.telegram_oauth_store import (
    purge_expired_states,
    purge_expired_tickets,
)

from routers import (
    admin,
    auth,
    deals,
    health,
    me,
    question,
    referral,
    webhooks_yookassa,
    worker_message_scripts_admin,
)

logger = logging.getLogger(__name__)


def _normalize_async_dsn(url: str) -> str:
    """
    Облачные провайдеры (Railway, Heroku, Render) выдают DSN в формате
    ``postgresql://...`` или ``postgres://...`` для синхронного драйвера.
    SQLAlchemy + asyncpg ожидает ``postgresql+asyncpg://...``.
    Нормализуем DSN, чтобы один и тот же ENV работал и в проде, и локально.
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


async def _telegram_oauth_purge_loop() -> None:
    """Удаляет просроченные OAuth state/exchange-tickets раз в минуту."""
    while True:
        await asyncio.sleep(60)
        try:
            await purge_expired_states()
            await purge_expired_tickets()
        except Exception:  # pragma: no cover
            logger.exception("Ошибка при очистке Telegram OAuth state")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging(settings.log_level)
    logger.info("Приложение стартует (env=%s)", settings.app_env)

    init_db(_normalize_async_dsn(settings.database_url))
    purge_task = asyncio.create_task(_telegram_oauth_purge_loop(), name="tg-oauth-purge")

    yield

    purge_task.cancel()
    try:
        await purge_task
    except (asyncio.CancelledError, Exception):  # pragma: no cover
        pass
    await dispose_db()
    logger.info("Приложение остановлено")


def create_app() -> FastAPI:
    app = FastAPI(
        title="looney moon API",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    local_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_origin_regex=local_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(deals.router)
    app.include_router(question.router)
    app.include_router(referral.router)
    app.include_router(admin.router)
    app.include_router(worker_message_scripts_admin.router)
    app.include_router(webhooks_yookassa.router)
    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    use_reload = settings.app_env == "development" and os.environ.get("UVICORN_RELOAD", "1") != "0"
    # Watch только наш код. Иначе watchfiles ловит изменения в venv,
    # .pg-portable и других артефактах и циклически перезапускает сервер.
    reload_dirs = ["core", "dependencies", "enums", "models", "routers", "schemas", "services", "utils"]
    reload_excludes = [".venv", ".pg-portable", "alembic", "frontend", ".pytest_cache", ".kilo", "__pycache__"]
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=use_reload,
        reload_dirs=reload_dirs if use_reload else None,
        reload_excludes=reload_excludes if use_reload else None,
    )
