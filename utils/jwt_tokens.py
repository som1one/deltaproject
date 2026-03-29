"""Создание и проверка JWT (алгоритм HS256 — HMAC-SHA256). Секреты и TTL из .env."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError, PyJWTError

from core.settings import settings

_TOKEN_TYPE_ACCESS = "access"
_TOKEN_TYPE_REFRESH = "refresh"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user_id: uuid.UUID) -> str:
    now = _utc_now()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": now,
        "type": _TOKEN_TYPE_ACCESS,
        "exp": now + timedelta(seconds=settings.jwt_expiration_time),
    }
    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(user_id: uuid.UUID) -> str:
    now = _utc_now()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": now,
        "type": _TOKEN_TYPE_REFRESH,
        "exp": now + timedelta(seconds=settings.refresh_token_expiration_time),
    }
    return jwt.encode(
        payload,
        settings.refresh_token_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def verify_access_token(token: str) -> dict[str, Any]:
    """
    Проверяет access-токен. Возвращает payload (в т.ч. sub).
    Бросает PyJWTError при невалидном токене или неверном типе.
    """
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    if payload.get("type") != _TOKEN_TYPE_ACCESS:
        raise InvalidTokenError("ожидался access-токен")
    return payload


def verify_refresh_token(token: str) -> dict[str, Any]:
    """Проверяет refresh-токен (отдельный секрет из .env)."""
    payload = jwt.decode(
        token,
        settings.refresh_token_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    if payload.get("type") != _TOKEN_TYPE_REFRESH:
        raise InvalidTokenError("ожидался refresh-токен")
    return payload


def get_user_id_from_payload(payload: dict[str, Any]) -> uuid.UUID:
    """Достаёт UUID пользователя из поля sub после успешной verify_*."""
    sub = payload.get("sub")
    if not sub:
        raise InvalidTokenError("нет sub в токене")
    return uuid.UUID(str(sub))


__all__ = [
    "PyJWTError",
    "InvalidTokenError",
    "create_access_token",
    "create_refresh_token",
    "verify_access_token",
    "verify_refresh_token",
    "get_user_id_from_payload",
]
