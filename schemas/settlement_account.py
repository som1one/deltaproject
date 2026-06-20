from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SettlementAccountUpsert(BaseModel):
    """Запрос на создание/обновление реквизитов расчётного счёта."""

    account_number: str = Field(..., pattern=r"^\d{20}$", description="Номер расчётного счёта (ровно 20 цифр)")
    bic: str = Field(..., pattern=r"^\d{9}$", description="БИК банка (ровно 9 цифр)")
    bank_name: str = Field(..., min_length=1, max_length=255, description="Наименование банка")
    recipient_name: str = Field(..., min_length=1, max_length=255, description="Наименование получателя")


class SettlementAccountResponse(BaseModel):
    """Ответ с реквизитами расчётного счёта."""

    model_config = {"from_attributes": True}

    account_number: str
    bic: str
    bank_name: str
    recipient_name: str
    updated_at: datetime
