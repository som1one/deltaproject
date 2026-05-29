from __future__ import annotations

import uuid
from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class FinancePreviewResponse(BaseModel):
    """Распределение суммы по схеме блогера (калькулятор в админке)."""

    bloger_id: uuid.UUID
    price_kopeks: int = Field(description="База расчёта, копейки")
    worker_kopeks: int
    bloger_kopeks: int
    upline_kopeks: int
    platform_kopeks: int
    weight_worker: int
    weight_bloger: int
    weight_upline: int
    weight_platform: int


class FinanceSchemeAdminRead(BaseModel):
    """Схема распределения для блогера (из БД или значения по умолчанию)."""

    blogger_id: uuid.UUID
    blogger_name: str
    blogger_email: str
    scheme_id: uuid.UUID | None = Field(description="null — в БД ещё нет строки, показаны дефолтные веса")
    weight_worker: int
    weight_bloger: int
    weight_upline: int
    weight_platform: int


class FinanceSchemeAdminPut(BaseModel):
    weight_worker: Annotated[int, Field(ge=0)]
    weight_bloger: Annotated[int, Field(ge=0)]
    weight_upline: Annotated[int, Field(ge=0)]
    weight_platform: Annotated[int, Field(ge=0)]

    @model_validator(mode="after")
    def weights_sum_positive(self) -> FinanceSchemeAdminPut:
        s = self.weight_worker + self.weight_bloger + self.weight_upline + self.weight_platform
        if s <= 0:
            raise ValueError("Сумма весов должна быть больше нуля")
        return self


class FinanceSchemeAdminListResponse(BaseModel):
    items: list[FinanceSchemeAdminRead]
    total: int
