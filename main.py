import logging
from contextlib import asynccontextmanager

from core.settings import settings
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.database import dispose_db, init_db
from core.logging import setup_logging

from routers import auth, health

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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
