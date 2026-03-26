
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", validation_alias="APP_ENV")

    database_url: str = Field(
        ...,
        validation_alias="DATABASE_URL",
        description="postgresql+asyncpg://...",
    )

    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")


settings = Settings()
