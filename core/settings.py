from uuid import UUID

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

    jwt_secret_key: str = Field(..., validation_alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_expiration_time: int = Field(
        default=3600,
        validation_alias="JWT_EXPIRATION_TIME",
        description="TTL access-токена в секундах",
    )
    refresh_token_secret_key: str = Field(
        ...,
        validation_alias="REFRESH_TOKEN_SECRET_KEY",
    )
    refresh_token_expiration_time: int = Field(
        default=86_400,
        validation_alias="REFRESH_TOKEN_EXPIRATION_TIME",
        description="TTL refresh-токена в секундах",
    )

    register_max_sessions_per_ip: int = Field(
        default=5,
        validation_alias="REGISTER_MAX_SESSIONS_PER_IP",
        description="Макс. записей сессии (регистраций) с одного IP за окно",
    )
    register_ip_window_hours: int = Field(
        default=24,
        validation_alias="REGISTER_IP_WINDOW_HOURS",
        description="Окно в часах для подсчёта регистраций по IP",
    )

    login_max_sessions_per_ip: int = Field(
        default=40,
        validation_alias="LOGIN_MAX_SESSIONS_PER_IP",
        description="Макс. успешных логинов с одного IP за окно",
    )
    login_ip_window_hours: int = Field(
        default=24,
        validation_alias="LOGIN_IP_WINDOW_HOURS",
        description="Окно для подсчёта логинов по IP",
    )

    ref_max_registrations_per_ip_per_blogger: int = Field(
        default=10,
        validation_alias="REF_MAX_REGISTRATIONS_PER_IP_PER_BLOGGER",
        description="Макс. регистраций работников с одного IP на одного блогера (linked_to) за окно",
    )
    ref_ip_window_hours: int = Field(
        default=24,
        validation_alias="REF_IP_WINDOW_HOURS",
        description="Окно для анти-спама реферальных регистраций",
    )

    platform_revenue_user_id: UUID = Field(
        default=UUID("00000000-0000-4000-8000-000000000001"),
        validation_alias="PLATFORM_REVENUE_USER_ID",
        description="UUID системного пользователя «Platform» для доли площадки",
    )

    rate_limit_register: str = Field(
        default="5/minute;20/hour;60/day",
        validation_alias="RATE_LIMIT_REGISTER",
        description="SlowAPI: регистрация (IP + X-Forwarded-For)",
    )
    rate_limit_login: str = Field(
        default="10/minute;40/hour;120/day",
        validation_alias="RATE_LIMIT_LOGIN",
        description="SlowAPI: попытки входа (все, включая неверный пароль)",
    )
    rate_limit_refresh: str = Field(
        default="30/minute;200/hour;800/day",
        validation_alias="RATE_LIMIT_REFRESH",
        description="SlowAPI: обновление токенов",
    )
    rate_limit_logout: str = Field(
        default="60/minute;300/hour",
        validation_alias="RATE_LIMIT_LOGOUT",
        description="SlowAPI: logout по IP",
    )
    rate_limit_deal_create: str = Field(
        default="12/minute;80/hour;300/day",
        validation_alias="RATE_LIMIT_DEAL_CREATE",
        description="SlowAPI: создание сделки (ключ user_id из JWT иначе IP)",
    )
    rate_limit_deal_mutate: str = Field(
        default="45/minute;400/hour;2000/day",
        validation_alias="RATE_LIMIT_DEAL_MUTATE",
        description="SlowAPI: PATCH статуса сделки",
    )
    rate_limit_deal_read: str = Field(
        default="90/minute;800/hour;4000/day",
        validation_alias="RATE_LIMIT_DEAL_READ",
        description="SlowAPI: GET сделки и GET /me/deals",
    )


settings = Settings()
