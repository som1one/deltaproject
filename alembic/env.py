import socket
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

from core.settings import settings
from models.base import Base

import models  # noqa: F401 — регистрация таблиц в Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _postgres_host_resolves() -> bool:
    try:
        socket.gethostbyname("postgres")
    except OSError:
        return False
    return True


def get_url() -> str:
    url = settings.database_url
    if "+asyncpg" in url:
        url = url.replace("postgresql+asyncpg", "postgresql+psycopg", 1)
    # В docker-compose хост postgres есть только внутри сети контейнеров;
    # с Mac/Windows без extra_hosts имя не резолвится — подставляем localhost и порт из compose.
    if not _postgres_host_resolves():
        url = url.replace("@postgres:", "@localhost:")
        url = url.replace("@postgres/", "@localhost/")
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
