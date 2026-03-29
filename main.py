import logging
from contextlib import asynccontextmanager

from core.settings import settings
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from core.database import dispose_db, init_db
from core.logging import setup_logging
from core.rate_limit import limiter

from routers import admin, auth, deals, health, me, referral

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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(deals.router)
    app.include_router(referral.router)
    app.include_router(admin.router)
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
