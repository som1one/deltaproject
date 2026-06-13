"""Отпечаток номера карты без хранения PAN в БД."""

from __future__ import annotations

import hashlib
import re


def normalize_pan(raw: str) -> str:
    s = re.sub(r"\D", "", (raw or "").strip())
    return s


def luhn_ok(pan: str) -> bool:
    digits = [int(d) for d in pan if d.isdigit()]
    if not digits:
        return False
    digits.reverse()
    total = 0
    for i, d in enumerate(digits):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def card_fingerprint(pan_normalized: str, pepper: str) -> str:
    payload = f"{pan_normalized}|{pepper}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def last4(pan_normalized: str) -> str:
    if len(pan_normalized) < 4:
        return pan_normalized
    return pan_normalized[-4:]


def compute_card_hash_and_last4(pan: str, pepper: str) -> tuple[str, str]:
    """Детерминированный отпечаток карты и последние 4 цифры.

    Общий хелпер для сохранения карты выплаты пользователем
    (``set_me_payout_card``) и админ-установки карты партнёра. Номер карты
    нормализуется (как ожидают ``card_fingerprint``/``last4``), после чего
    возвращается только ``(hash, last4)`` — полный PAN не сохраняется и не
    возвращается.

    :param pan: номер карты (нормализованный или с разделителями).
    :param pepper: секрет хеширования (``settings.payout_card_pepper``).
    :returns: кортеж ``(card_hash, last4)``.
    """
    pan_normalized = normalize_pan(pan)
    return card_fingerprint(pan_normalized, pepper), last4(pan_normalized)
