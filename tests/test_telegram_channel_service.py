"""Нормализация channel_id ворот подписки: что бы админ ни вставил в поле,
в конфиг должно попасть то, что понимает Bot API (@username или -100…-id)."""

import pytest

from services.telegram_channel_service import normalize_channel_id


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("@geroicchanel", "@geroicchanel"),
        ("geroicchanel", "@geroicchanel"),
        ("  @geroicchanel  ", "@geroicchanel"),
        ("https://t.me/geroicchanel", "@geroicchanel"),
        ("http://t.me/geroicchanel/", "@geroicchanel"),
        ("t.me/geroicchanel", "@geroicchanel"),
        ("t.me/s/geroicchanel", "@geroicchanel"),
        ("telegram.me/geroicchanel", "@geroicchanel"),
        ("https://t.me/geroicchanel?start=x", "@geroicchanel"),
        ("-1004317063288", "-1004317063288"),
        ("4317063288", "4317063288"),
        # Инвайт приватного канала не нормализуем — его отсечёт getChat-валидация
        ("https://t.me/+AbCdEf123", "+AbCdEf123"),
        ("", ""),
        ("   ", ""),
    ],
)
def test_normalize_channel_id(raw: str, expected: str) -> None:
    assert normalize_channel_id(raw) == expected
