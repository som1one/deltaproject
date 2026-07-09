from uuid import UUID

from pydantic import AliasChoices, Field
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
    jwt_algorithm: str = Field(default="HS512", validation_alias="JWT_ALGORITHM")
    jwt_expiration_time: int = Field(
        default=3600,
        validation_alias="JWT_EXPIRATION_TIME",
        description="TTL access-токена в секундах",
    )
    blogger_cabinet_unlock_secret: str = Field(
        default="",
        validation_alias="BLOGGER_CABINET_UNLOCK_SECRET",
        description="Секрет HMAC для cookie/токена разблокировки кабинета блогера; пусто — используется JWT_SECRET_KEY",
    )
    blogger_cabinet_unlock_ttl_seconds: int = Field(
        default=604_800,
        validation_alias="BLOGGER_CABINET_UNLOCK_TTL_SECONDS",
        description="Срок жизни разблокировки кабинета блогера (секунды)",
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
    telegram_oauth_enabled: bool = Field(
        default=False,
        validation_alias="TELEGRAM_OAUTH_ENABLED",
        description="Включить Telegram OAuth Login",
    )
    telegram_oauth_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("TELEGRAM_OAUTH_CLIENT_ID", "TELEGRAM_OAUTH_СLIENT_ID"),
        description="Client ID из BotFather для Telegram Login library / OIDC",
    )
    telegram_oauth_client_secret: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_CLIENT_SECRET",
        description="Client Secret из BotFather для Telegram Login / OIDC",
    )
    telegram_oauth_issuer: str = Field(
        default="https://oauth.telegram.org",
        validation_alias="TELEGRAM_OAUTH_ISSUER",
        description="Issuer для проверки Telegram id_token",
    )
    telegram_oauth_jwks_url: str = Field(
        default="https://oauth.telegram.org/.well-known/jwks.json",
        validation_alias="TELEGRAM_OAUTH_JWKS_URL",
        description="JWKS endpoint для проверки подписи Telegram id_token",
    )
    telegram_oauth_bot_username: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_BOT_USERNAME",
        description="Username Telegram-бота без @, например my_auth_bot",
    )
    telegram_oauth_bot_token: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_BOT_TOKEN",
        description="Bot token для проверки подписи Telegram OAuth",
    )
    telegram_oauth_max_age_seconds: int = Field(
        default=300,
        validation_alias="TELEGRAM_OAUTH_MAX_AGE_SECONDS",
        description="Макс. возраст auth_date Telegram OAuth (секунды)",
    )
    telegram_oauth_redirect_uri: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_REDIRECT_URI",
        description="URL, который зарегистрирован в BotFather как Allowed redirect_uri",
    )
    telegram_oauth_frontend_callback_url: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_FRONTEND_CALLBACK_URL",
        description="Куда backend редиректит фронт после OAuth (страница /tg/callback)",
    )
    telegram_oauth_proxy: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_PROXY",
        description="SOCKS5 прокси для запросов к oauth.telegram.org (обход блокировки РКН), напр. socks5://127.0.0.1:40000",
    )
    telegram_oauth_proxy_secret: str = Field(
        default="",
        validation_alias="TELEGRAM_OAUTH_PROXY_SECRET",
        description="Секрет X-Proxy-Secret для Cloudflare Worker прокси (если Worker защищён AUTH_SECRET)",
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

    allowed_origins: str = Field(
        default="",
        validation_alias="ALLOWED_ORIGINS",
        description=(
            "Список прод-доменов фронтенда через запятую, "
            "напр. https://app.example.com,https://admin.example.com. "
            "Локалхост (localhost / 127.0.0.1) разрешается всегда."
        ),
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.allowed_origins.split(",")
            if origin.strip()
        ]

    payout_card_pepper: str = Field(
        default="",
        validation_alias="PAYOUT_CARD_PEPPER",
        description="Секрет для SHA-256 отпечатка карты (не хранить PAN в БД)",
    )

    collection_card_enc_key: str = Field(
        default="",
        validation_alias="COLLECTION_CARD_ENC_KEY",
        description=(
            "Ключ (Fernet, base64 32 байта) для шифрования PAN Карты_Приёма при "
            "хранении; пусто — приём/чтение полного PAN отключены (503)"
        ),
    )

    yukassa_payout_enabled: bool = Field(
        default=False,
        validation_alias="YUKASSA_PAYOUT_ENABLED",
        description="Включить вывод через ЮKassa (виджет + API выплат)",
    )
    yukassa_payout_shop_id: str = Field(
        default="",
        validation_alias="YUKASSA_PAYOUT_SHOP_ID",
        description="shopId для Basic Auth API выплат (ЛК ЮKassa)",
    )
    yukassa_payout_secret_key: str = Field(
        default="",
        validation_alias="YUKASSA_PAYOUT_SECRET_KEY",
        description="Секретный ключ для API выплат",
    )
    yukassa_payout_gateway_id: str = Field(
        default="",
        validation_alias="YUKASSA_PAYOUT_GATEWAY_ID",
        description="Идентификатор шлюза (agentId) для виджета сбора карты",
    )
    yukassa_webhook_secret: str = Field(
        default="",
        validation_alias="YUKASSA_WEBHOOK_SECRET",
        description="Если задан — заголовок X-Yukassa-Webhook-Secret должен совпадать",
    )

    marketplace_frontend_url: str = Field(
        default="https://marketplace.looneymoon.ru",
        validation_alias="MARKETPLACE_FRONTEND_URL",
        description="Базовый URL фронтенда маркетплейса: реф-ссылки + allow-list "
        "redirect_uri для SSO-входа блогера (см. _validate_marketplace_redirect)",
    )

    @property
    def yukassa_payout_active(self) -> bool:
        """Выплаты через API ЮKassa (требуются shop id и секрет)."""
        return self.yukassa_payout_enabled and bool(
            self.yukassa_payout_shop_id.strip(),
        ) and bool(self.yukassa_payout_secret_key.strip())

    @property
    def yukassa_payout_widget_ready(self) -> bool:
        """Можно показать виджет сбора карты (нужен gateway id)."""
        return self.yukassa_payout_active and bool(self.yukassa_payout_gateway_id.strip())

    @property
    def telegram_oauth_ready(self) -> bool:
        if not self.telegram_oauth_enabled:
            return False
        return (
            bool(self.telegram_oauth_client_id.strip())
            and bool(self.telegram_oauth_client_secret.strip())
            and bool(self.telegram_oauth_redirect_uri.strip())
            and bool(self.telegram_oauth_frontend_callback_url.strip())
        )


settings = Settings()
