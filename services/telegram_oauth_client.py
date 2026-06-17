"""HTTP-клиент к oauth.telegram.org.

Упрощённый OIDC: меняем authorization code на id_token и валидируем его
по JWKS. Возвращаем уже распарсенные claims.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWK
from jwt.exceptions import PyJWTError

from core.settings import settings


logger = logging.getLogger(__name__)


_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# ── JWKS cache ───────────────────────────────────────────────────────
_jwks_keys: list[PyJWK] = []
_jwks_fetched_at: float = 0.0
_jwks_lock = asyncio.Lock()
_JWKS_CACHE_TTL = 300  # 5 минут


@dataclass(frozen=True)
class TelegramOIDCClaims:
    sub: str               # уникальный telegram user id (числовой, как строка)
    name: str
    preferred_username: str  # @username без @
    picture: str | None


class TelegramOAuthError(Exception):
    """Любая ошибка OIDC-обмена. Текст безопасен для показа."""


def _resolve_proxy() -> tuple[str | None, bool]:
    """Возвращает (proxy_url, is_reverse_proxy).

    Если TELEGRAM_OAUTH_PROXY начинается с https:// — это Cloudflare Worker
    (reverse-proxy): мы подменяем URL запроса вместо использования transport proxy.
    """
    proxy = settings.telegram_oauth_proxy.strip() or None
    if proxy and proxy.startswith("https://"):
        return proxy, True
    return proxy, False


async def _fetch_jwks() -> list[PyJWK]:
    """Загружает JWKS-ключи через httpx (тот же путь, что и exchange_code)."""
    global _jwks_keys, _jwks_fetched_at

    async with _jwks_lock:
        # Проверяем кеш под локом
        if _jwks_keys and (time.time() - _jwks_fetched_at) < _JWKS_CACHE_TTL:
            return _jwks_keys

        proxy, is_reverse = _resolve_proxy()

        if is_reverse:
            jwks_url = f"{proxy.rstrip('/')}/.well-known/jwks.json"
            transport = None
        else:
            jwks_url = settings.telegram_oauth_jwks_url
            transport = httpx.AsyncHTTPTransport(proxy=proxy) if proxy else None

        headers: dict[str, str] = {"User-Agent": _USER_AGENT}

        try:
            async with httpx.AsyncClient(
                timeout=30.0, transport=transport, trust_env=False,
            ) as client:
                response = await client.get(jwks_url, headers=headers)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            raise TelegramOAuthError(
                f"Не удалось загрузить JWKS: {type(exc).__name__} {exc}"
            ) from exc

        try:
            keys = [PyJWK.from_dict(k) for k in data.get("keys", [])]
        except Exception as exc:
            raise TelegramOAuthError(
                f"Ошибка парсинга JWKS: {exc}"
            ) from exc

        if not keys:
            raise TelegramOAuthError("JWKS не содержит ключей")

        _jwks_keys = keys
        _jwks_fetched_at = time.time()
        return _jwks_keys


def _find_signing_key(keys: list[PyJWK], id_token: str) -> Any:
    """Находит ключ по kid из заголовка JWT."""
    try:
        header = jwt.get_unverified_header(id_token)
    except PyJWTError as exc:
        raise TelegramOAuthError(f"Невалидный JWT заголовок: {exc}") from exc

    kid = header.get("kid")
    for key in keys:
        if key.key_id == kid:
            return key.key

    available = [k.key_id for k in keys]
    raise TelegramOAuthError(
        f"Ключ kid={kid!r} не найден в JWKS (доступные: {available})"
    )


async def exchange_code(*, code: str, redirect_uri: str) -> str:
    """Меняет authorization_code на id_token. Возвращает сырой id_token."""
    url = f"{settings.telegram_oauth_issuer.rstrip('/')}/token"
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }
    auth = (settings.telegram_oauth_client_id, settings.telegram_oauth_client_secret)

    headers: dict[str, str] = {"User-Agent": _USER_AGENT}
    proxy_secret = settings.telegram_oauth_proxy_secret.strip()
    if proxy_secret:
        headers["X-Proxy-Secret"] = proxy_secret

    proxy, is_reverse = _resolve_proxy()

    try:
        if is_reverse:
            url = f"{proxy.rstrip('/')}/token"
            transport = None
        else:
            transport = httpx.AsyncHTTPTransport(proxy=proxy) if proxy else None

        async with httpx.AsyncClient(
            timeout=30.0, transport=transport, trust_env=False,
        ) as client:
            response = await client.post(url, data=data, auth=auth, headers=headers)
    except (httpx.HTTPError, asyncio.TimeoutError) as exc:
        logger.warning("Telegram OAuth token endpoint unreachable: %s", exc)
        raise TelegramOAuthError(
            f"Не удалось связаться с Telegram OAuth: {type(exc).__name__} {exc}"
        ) from exc

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


async def verify_id_token(*, id_token: str, expected_nonce: str) -> TelegramOIDCClaims:
    """Проверяет подпись и обязательные клеймы id_token.

    Бросает :class:`TelegramOAuthError` при любой проблеме.
    """
    keys = await _fetch_jwks()
    signing_key = _find_signing_key(keys, id_token)

    try:
        decoded = jwt.decode(
            id_token,
            signing_key,
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
