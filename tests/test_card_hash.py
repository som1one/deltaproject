"""Утилита отпечатка карты: нормализация, Luhn, хэш."""

from utils.card_hash import card_fingerprint, last4, luhn_ok, normalize_pan


def test_normalize_pan_strips_non_digits() -> None:
    assert normalize_pan("  4276 1234 5678 9010  ") == "4276123456789010"


def test_luhn_valid_visa_like() -> None:
    # Пример проходящий Luhn (тестовый номер)
    assert luhn_ok("4532015112830366") is True


def test_luhn_invalid() -> None:
    assert luhn_ok("4532015112830367") is False


def test_card_fingerprint_stable_with_pepper() -> None:
    pan = "4532015112830366"
    a = card_fingerprint(pan, "pepper-a")
    b = card_fingerprint(pan, "pepper-a")
    c = card_fingerprint(pan, "pepper-b")
    assert a == b
    assert a != c
    assert len(a) == 64


def test_last4() -> None:
    assert last4("4532015112830366") == "0366"
