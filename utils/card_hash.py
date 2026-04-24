"""Отпечаток номера карты без хранения PAN в БД."""

from __future__ import annotations

import hashlib
import re


def normalize_pan(raw: str) -> str:
    s = re.sub(r"\D", "", (raw or "").strip())
    return s


def luhn_ok(pan: str) -> bool:
    if not pan.isdigit():
        return False
    digits = [int(c) for c in pan]
    checksum = 0
    parity = len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def card_fingerprint(pan_normalized: str, pepper: str) -> str:
    payload = f"{pan_normalized}|{pepper}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def last4(pan_normalized: str) -> str:
    if len(pan_normalized) < 4:
        return pan_normalized
    return pan_normalized[-4:]
