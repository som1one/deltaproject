"""Лимиты запросов (SlowAPI). IP берётся с учётом X-Forwarded-For."""

from __future__ import annotations

from jwt.exceptions import PyJWTError
from slowapi import Limiter
from starlette.requests import Request

from utils.jwt_tokens import get_user_id_from_payload, verify_access_token
from utils.request_ip import get_client_ip


def key_client_ip(request: Request) -> str:
    return get_client_ip(request)


def key_user_id_or_client_ip(request: Request) -> str:
    """Для защищённых ручек: счётчик на пользователя по access JWT, иначе по IP."""
    raw = request.headers.get("Authorization")
    if raw:
        parts = raw.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
        else:
            token = raw.strip()
        if token:
            try:
                payload = verify_access_token(token)
                uid = get_user_id_from_payload(payload)
                return f"user:{uid}"
            except PyJWTError:
                pass
    return f"ip:{get_client_ip(request)}"


limiter = Limiter(key_func=key_client_ip)
