"""Подписанный токен разблокировки кабинета блогера (cookie или заголовок)."""

import base64
import hashlib
import hmac
import struct
import time
import uuid

from core.settings import settings

BLOGGER_CABINET_COOKIE_NAME = "blogger_cabinet_unlock"
BLOGGER_CABINET_HEADER_NAME = "X-Blogger-Cabinet-Unlock"


def _signing_key() -> bytes:
    raw = settings.blogger_cabinet_unlock_secret.strip() or settings.jwt_secret_key
    return raw.encode("utf-8")


def create_blogger_cabinet_unlock_token(user_id: uuid.UUID) -> str:
    exp = int(time.time()) + int(settings.blogger_cabinet_unlock_ttl_seconds)
    uid_bytes = user_id.bytes
    payload = struct.pack("!I", len(uid_bytes)) + uid_bytes + struct.pack("!Q", exp)
    sig = hmac.new(_signing_key(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + sig).decode("ascii").rstrip("=")


def verify_blogger_cabinet_unlock_token(token: str, user_id: uuid.UUID) -> bool:
    if not token:
        return False
    pad = "=" * (-len(token) % 4)
    try:
        raw = base64.urlsafe_b64decode(token + pad)
    except (ValueError, TypeError):
        return False
    if len(raw) < 4 + 16 + 8 + 32:
        return False
    sig = raw[-32:]
    payload = raw[:-32]
    expect = hmac.new(_signing_key(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expect):
        return False
    n = struct.unpack("!I", payload[:4])[0]
    if len(payload) < 4 + n + 8:
        return False
    uid_part = payload[4 : 4 + n]
    exp = struct.unpack("!Q", payload[4 + n : 4 + n + 8])[0]
    try:
        parsed = uuid.UUID(bytes=uid_part)
    except ValueError:
        return False
    if parsed != user_id:
        return False
    return exp >= int(time.time())


# avoid NameError for binascii — use Exception only; actually I used wrong trick