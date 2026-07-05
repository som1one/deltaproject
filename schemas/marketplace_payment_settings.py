"""Схемы настроек приёма оплаты маркетплейса."""

from __future__ import annotations

import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


_CARD_RE = re.compile(r"^\d{13,19}$")
_PHONE_RE = re.compile(r"^\+?\d{10,15}$")


class PaymentSettingsUpsert(BaseModel):
    """Создание/обновление настроек оплаты. Пустая строка очищает поле."""

    card_number: str | None = Field(default=None, description="Номер карты (13–19 цифр, пробелы допустимы)")
    card_holder: str | None = Field(default=None, max_length=255)
    card_bank: str | None = Field(default=None, max_length=255)
    sbp_phone: str | None = Field(default=None, description="Телефон для СБП")
    yookassa_shop_id: str | None = Field(default=None, max_length=80)
    yookassa_secret_key: str | None = Field(
        default=None,
        max_length=255,
        description="Секретный ключ ЮKassa. None — оставить прежний, '' — очистить.",
    )
    yookassa_enabled: bool = False

    @field_validator("card_number")
    @classmethod
    def validate_card(cls, v: str | None) -> str | None:
        if v is None:
            return None
        digits = re.sub(r"[\s-]", "", v)
        if digits == "":
            return ""
        if not _CARD_RE.match(digits):
            raise ValueError("Номер карты должен содержать 13–19 цифр")
        return digits

    @field_validator("sbp_phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = re.sub(r"[\s()-]", "", v)
        if cleaned == "":
            return ""
        if not _PHONE_RE.match(cleaned):
            raise ValueError("Телефон должен содержать 10–15 цифр")
        return cleaned

    @field_validator("card_holder", "card_bank", "yookassa_shop_id")
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v


class PaymentSettingsResponse(BaseModel):
    """Ответ админке: секретный ключ маскируется."""

    card_number: str | None = None
    card_holder: str | None = None
    card_bank: str | None = None
    sbp_phone: str | None = None
    yookassa_shop_id: str | None = None
    yookassa_secret_set: bool = False
    yookassa_enabled: bool = False
    updated_at: datetime | None = None


class CardRequisitesPublic(BaseModel):
    """Реквизиты карты, показываемые заказчику при оплате."""

    card_number: str
    card_holder: str | None = None
    card_bank: str | None = None
    sbp_phone: str | None = None
