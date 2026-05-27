"""State + exchange-tickets для Telegram OIDC.

* ``state`` — самоподдерживаемый токен: подписанный HMAC payload с nonce,
  linked_to и timestamp. Не зависит от памяти процесса, переживает
  рестарт backend. Передаётся в параметре ``state=`` Telegram.
* ``ExchangeTicket`` — одноразовый код, который callback кладёт после
  успешного OIDC-обмена, а фронт обменивает на JWT-пары через
  ``/auth/telegram/exchange``. Живёт в памяти, секунды до использования.

В multi-instance setup ``ExchangeTicket`` нужно вынести в Redis.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from core.settings import settings


STATE_TTL_SECONDS = 5 * 60   # время на прохождение Telegram-авторизации
EXCHANGE_TTL_SECONDS = 2 * 60  # время от callback до /exchange на фронте
TOKEN_BYTES = 24


def _now() -> int:
    return int(time.time())


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _state_secret() -> bytes:
    """HMAC-секрет для подписи state. Берём JWT-секрет, чтобы не плодить ENV."""
    return settings.jwt_secret_key.encode("utf-8")


@dataclass(frozen=True)
class OAuthState:
    state: str
    nonce: str
    linked_to: str | None = None
    client_ip: str = ""


def create_signed_state(*, linked_to: str | None, client_ip: str) -> OAuthState:
    """Возвращает OAuthState с уже сериализованным самоподдерживаемым ``state``."""
    nonce = secrets.token_urlsafe(TOKEN_BYTES)
    payload = {
        "n": nonce,
        "l": linked_to,
        "ip": client_ip,
        "t": _now(),
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(_state_secret(), body.encode("ascii"), hashlib.sha256).digest()
    state_token = f"{body}.{_b64encode(sig)}"
    return OAuthState(state=state_token, nonce=nonce, linked_to=linked_to, client_ip=client_ip)


def verify_signed_state(state_token: str) -> OAuthState | None:
    """Проверяет HMAC, TTL, парсит payload. None — если state невалидный."""
    if not state_token or "." not in state_token:
        return None
    body, sig_b64 = state_token.rsplit(".", 1)
    try:
        expected_sig = hmac.new(_state_secret(), body.encode("ascii"), hashlib.sha256).digest()
        actual_sig = _b64decode(sig_b64)
    except (ValueError, TypeError):
        return None
    if not hmac.compare_digest(expected_sig, actual_sig):
        return None
    try:
        payload_bytes = _b64decode(body)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    nonce = payload.get("n")
    issued_at = payload.get("t")
    if not isinstance(nonce, str) or not isinstance(issued_at, int):
        return None
    if _now() - issued_at > STATE_TTL_SECONDS:
        return None
    linked_to = payload.get("l") if isinstance(payload.get("l"), str) else None
    client_ip = payload.get("ip") if isinstance(payload.get("ip"), str) else ""
    return OAuthState(state=state_token, nonce=nonce, linked_to=linked_to, client_ip=client_ip)


@dataclass
class ExchangeTicket:
    ticket: str
    created_at: float
    access_token: str
    refresh_token: str


_ticket_lock = asyncio.Lock()
_tickets: dict[str, ExchangeTicket] = {}


async def create_exchange_ticket(*, access_token: str, refresh_token: str) -> ExchangeTicket:
    ticket = ExchangeTicket(
        ticket=secrets.token_urlsafe(TOKEN_BYTES),
        created_at=time.time(),
        access_token=access_token,
        refresh_token=refresh_token,
    )
    async with _ticket_lock:
        _tickets[ticket.ticket] = ticket
    return ticket


async def consume_exchange_ticket(ticket: str) -> ExchangeTicket | None:
    async with _ticket_lock:
        entry = _tickets.pop(ticket, None)
    if entry is None:
        return None
    if time.time() - entry.created_at > EXCHANGE_TTL_SECONDS:
        return None
    return entry


async def purge_expired_states() -> int:
    """Совместимость — для signed state ничего чистить не нужно."""
    return 0


async def purge_expired_tickets() -> int:
    cutoff = time.time() - EXCHANGE_TTL_SECONDS
    removed = 0
    async with _ticket_lock:
        for key in list(_tickets.keys()):
            if _tickets[key].created_at < cutoff:
                _tickets.pop(key, None)
                removed += 1
    return removed
