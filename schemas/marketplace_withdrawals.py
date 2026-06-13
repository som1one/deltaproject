from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from enums.marketplace import WithdrawalStatus


class WithdrawalRequest(BaseModel):
    """Запрос на вывод средств (блогер/воркер)."""

    amount_kopeks: Annotated[int, Field(ge=100, description="Сумма вывода в копейках, минимум 100 (1 RUB)")]

    @field_validator("amount_kopeks")
    @classmethod
    def validate_amount_precision(cls, v: int) -> int:
        """Проверяет, что сумма в копейках корректна.

        Поскольку amount_kopeks — целое число, оно всегда имеет точность
        до копейки (max 2 decimal places при выражении в рублях).
        """
        if v < 100:
            raise ValueError("Минимальная сумма вывода — 1.00 RUB (100 копеек)")
        return v


class WithdrawalResponse(BaseModel):
    """Ответ с данными запроса на вывод."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    amount_kopeks: int
    status: WithdrawalStatus
    yookassa_payout_id: str | None = None
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    updated_at: datetime


class WithdrawalListResponse(BaseModel):
    """Список запросов на вывод с пагинацией."""

    items: list[WithdrawalResponse]
    total: int
    page: int
    page_size: int
