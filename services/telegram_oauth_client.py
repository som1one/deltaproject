"""HTTP-клиент к oauth.telegram.org.

Упрощённый OIDC: меняем authorization code на id_token и валидируем его
по JWKS. Возвращаем уже распарсенные claims.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError

from core.settings import settings


logger = logging.getLogger(__name__)


_TOKEN_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class TelegramOIDCClaims:
    sub: str               # уникальный telegram user id (числовой, как строка)
    name: str
    preferred_username: str  # @username без @
    picture: str | None


class TelegramOAuthError(Exception):
    """Любая ошибка OIDC-обмена. Текст безопасен для показа."""


_jwks_lock = asyncio.Lock()
_jwks_client: PyJWKClient | None = None


class HttpxJWKClient(PyJWKClient):
    def fetch_data(self) -> Any:
        import httpx
        with httpx.Client(timeout=15.0) as client:
            response = client.get(self.uri, headers=self.headers)
            response.raise_for_status()
            return response.json()

def _get_jwks_client() -> PyJWKClient:
    """Lazy-инициализация PyJWKClient с кешированием ключей."""
    global _jwks_client
    if _jwks_client is None:
        jwks_url = settings.telegram_oauth_jwks_url
        proxy = settings.telegram_oauth_proxy.strip()
        # Если прокси начинается с https://, считаем это reverse-proxy (например, Cloudflare Worker)
        if proxy.startswith("https://"):
            jwks_url = f"{proxy.rstrip('/')}/.well-known/jwks.json"

        # Используем кастомный клиент на базе httpx, так как urllib может падать с 'Network is unreachable' (IPv6 issues)
        _jwks_client = HttpxJWKClient(
            jwks_url, 
            cache_keys=True, 
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
    return _jwks_client


async def exchange_code(*, code: str, redirect_uri: str) -> str:
    """Меняет authorization_code на id_token. Возвращает сырой id_token."""
    url = f"{settings.telegram_oauth_issuer.rstrip('/')}/token"
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }
    auth = (settings.telegram_oauth_client_id, settings.telegram_oauth_client_secret)

    headers: dict[str, str] = {}
    proxy_secret = settings.telegram_oauth_proxy_secret.strip()
    if proxy_secret:
        headers["X-Proxy-Secret"] = proxy_secret

    try:
        proxy = settings.telegram_oauth_proxy.strip() or None
        
        if proxy and proxy.startswith("https://"):
            # Если прокси начинается с https:// - это Cloudflare Worker (reverse-proxy)
            url = f"{proxy.rstrip('/')}/token"
            transport = None
        else:
            url = f"{settings.telegram_oauth_issuer.rstrip('/')}/token"
            transport = httpx.AsyncHTTPTransport(proxy=proxy) if proxy else None
            
        async with httpx.AsyncClient(timeout=_TOKEN_TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.post(url, data=data, auth=auth, headers=headers)
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        logger.warning("Telegram OAuth token endpoint unreachable: %s", exc)
        raise TelegramOAuthError("Не удалось связаться с Telegram OAuth") from exc

    if response.status_code != 200:
        logger.warning(
            "Telegram OAuth token endpoint returned %s: %s",
            response.status_code,
            response.text[:300],
        )
        raise TelegramOAuthError("Telegram отклонил обмен авторизационного кода")

    try:
        payload: dict[str, Any] = response.json()
    except ValueError as exc:
        raise TelegramOAuthError("Telegram вернул некорректный ответ") from exc

    id_token = payload.get("id_token")
    if not isinstance(id_token, str) or not id_token:
        raise TelegramOAuthError("Telegram не вернул id_token")
    return id_token


def verify_id_token(*, id_token: str, expected_nonce: str) -> TelegramOIDCClaims:
    """Проверяет подпись и обязательные клеймы id_token.

    Бросает :class:`TelegramOAuthError` при любой проблеме.
    """
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(id_token)
    except PyJWTError as exc:
        raise TelegramOAuthError(f"Не удалось получить ключ подписи Telegram: {exc}") from exc

    try:
        decoded = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256", "ES256", "EdDSA", "ES256K"],
            issuer=settings.telegram_oauth_issuer,
            audience=settings.telegram_oauth_client_id,
            leeway=10,
            options={
                "require": ["exp", "iat", "iss", "aud", "sub", "nonce"],
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
                "verify_iat": True,
            },
        )
    except PyJWTError as exc:
        raise TelegramOAuthError(f"Невалидный id_token: {exc}") from exc

    nonce = decoded.get("nonce")
    if not isinstance(nonce, str) or nonce != expected_nonce:
        raise TelegramOAuthError("Подмена nonce в id_token")

    sub = decoded.get("sub")
    if not isinstance(sub, (str, int)):
        raise TelegramOAuthError("В id_token нет sub")
    sub_str = str(sub)

    name_raw = decoded.get("name")
    name = name_raw.strip() if isinstance(name_raw, str) else ""
    username_raw = decoded.get("preferred_username")
    username = username_raw.strip().lstrip("@").lower() if isinstance(username_raw, str) else ""
    picture_raw = decoded.get("picture")
    picture = picture_raw if isinstance(picture_raw, str) and picture_raw else None

    if not name:
        name = f"@{username}" if username else f"tg-{sub_str}"

    return TelegramOIDCClaims(
        sub=sub_str,
        name=name,
        preferred_username=username,
        picture=picture,
    )
