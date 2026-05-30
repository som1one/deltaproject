"""Шифрование полного номера Карты_Приёма при хранении.

В отличие от Карты_Выплаты (где хранится только хеш), Карта_Приёма должна
предъявляться плательщику целиком, поэтому полный PAN хранится в зашифрованном
виде. Используется симметричное аутентифицированное шифрование
``cryptography.fernet.Fernet`` (конфиденциальность + целостность через HMAC +
встроенная метка версии ключа для ротации). Ключ берётся из
``settings.collection_card_enc_key`` (переменная окружения
``COLLECTION_CARD_ENC_KEY``).

Полный PAN НИКОГДА не логируется и не попадает в аудит — в БД хранится только
ciphertext и последние 4 цифры.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


class CardCryptoKeyError(RuntimeError):
    """Ключ шифрования Карты_Приёма не задан или некорректен.

    Сервис транслирует это исключение в HTTP 503 (как для пустого
    ``PAYOUT_CARD_PEPPER``): приём и чтение полного PAN недоступны, пока ключ
    не сконфигурирован.
    """


class CardCryptoError(RuntimeError):
    """Не удалось расшифровать ciphertext Карты_Приёма (повреждён/чужой ключ)."""


def _build_fernet(key: str) -> Fernet:
    """Создать ``Fernet`` из ключа настроек.

    :param key: ключ Fernet (URL-safe base64, 32 байта).
    :raises CardCryptoKeyError: ключ пуст или не является валидным ключом Fernet.
    """
    normalized = (key or "").strip()
    if not normalized:
        raise CardCryptoKeyError(
            "Шифрование Карты_Приёма отключено: не задан COLLECTION_CARD_ENC_KEY",
        )
    try:
        return Fernet(normalized.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise CardCryptoKeyError(
            "Некорректный COLLECTION_CARD_ENC_KEY: ожидается ключ Fernet (base64, 32 байта)",
        ) from exc


def encrypt_pan(pan_normalized: str, key: str) -> str:
    """Зашифровать нормализованный PAN для хранения в Text-колонке.

    :param pan_normalized: нормализованный номер карты (только цифры).
    :param key: ключ Fernet из ``settings.collection_card_enc_key``.
    :returns: ciphertext (str) для колонки ``collection_card_pan_encrypted``.
    :raises CardCryptoKeyError: если ключ не задан/некорректен (→ 503 в сервисе).
    """
    fernet = _build_fernet(key)
    token = fernet.encrypt(pan_normalized.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_pan(ciphertext: str, key: str) -> str:
    """Расшифровать сохранённый ciphertext обратно в нормализованный PAN.

    :param ciphertext: значение из колонки ``collection_card_pan_encrypted``.
    :param key: ключ Fernet из ``settings.collection_card_enc_key``.
    :returns: нормализованный PAN.
    :raises CardCryptoKeyError: если ключ не задан/некорректен (→ 503 в сервисе).
    :raises CardCryptoError: если ciphertext повреждён или зашифрован другим ключом.
    """
    fernet = _build_fernet(key)
    try:
        plain = fernet.decrypt(ciphertext.encode("utf-8"))
    except InvalidToken as exc:
        raise CardCryptoError(
            "Не удалось расшифровать номер Карты_Приёма",
        ) from exc
    return plain.decode("utf-8")
