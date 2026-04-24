import random
import re
import secrets


BLOGGER_NICKNAME_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$")
_UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_LOWERCASE = "abcdefghijklmnopqrstuvwxyz"
_DIGITS = "0123456789"
_SPECIALS = "!@#$%&*?"


def normalize_blogger_nickname(value: str) -> str:
    nickname = value.strip().lower()
    if not BLOGGER_NICKNAME_PATTERN.fullmatch(nickname):
        raise ValueError("Некорректный ник блогера")
    return nickname


def build_blogger_internal_email(nickname: str) -> str:
    return f"blogger.{nickname}@internal.bloger-network.local"


def generate_blogger_password() -> str:
    chars = [
        *(secrets.choice(_UPPERCASE) for _ in range(3)),
        *(secrets.choice(_SPECIALS) for _ in range(2)),
        *(secrets.choice(_DIGITS) for _ in range(4)),
        *(secrets.choice(_LOWERCASE) for _ in range(8)),
    ]
    random.SystemRandom().shuffle(chars)
    return "".join(chars)
