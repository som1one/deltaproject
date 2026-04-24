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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging(settings.log_level)
    logger.info("Приложение стартует (env=%s)", settings.app_env)

    init_db(settings.database_url)

    yield

    await dispose_db()
    logger.info("Приложение остановлено")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Delta API",
        lifespan=lifespan,
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    local_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
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
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=use_reload,
    )
