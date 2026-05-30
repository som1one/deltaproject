import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, model_validator

from enums.deal import DealStatus
from schemas.payment_details import PaymentRequisites


class DealCreate(BaseModel):
    shop_link: Annotated[str, Field(min_length=1, max_length=2048)]
    item_name: Annotated[str, Field(min_length=1, max_length=512)]
    seller_tg: Annotated[str, Field(min_length=1, max_length=255)]
    seller_number: Annotated[str, Field(min_length=1, max_length=64)]
    price: Annotated[int, Field(gt=0)]
    bloger_id: uuid.UUID


class DealStatusPatch(BaseModel):
    """Только смена статуса сделки."""

    status: DealStatus


class DealFieldsPatch(BaseModel):
    """Частичное редактирование полей сделки воркером (только в статусе NEW)."""

    shop_link: Annotated[str | None, Field(default=None, min_length=1, max_length=2048)] = None
    item_name: Annotated[str | None, Field(default=None, min_length=1, max_length=512)] = None
    seller_tg: Annotated[str | None, Field(default=None, min_length=1, max_length=255)] = None
    seller_number: Annotated[str | None, Field(default=None, min_length=1, max_length=64)] = None
    price: Annotated[int | None, Field(default=None, gt=0)] = None


class AdminDealStatusPatch(BaseModel):
    status: DealStatus
    reason: Annotated[str, Field(min_length=1, max_length=1000)]


class AdminDealRecalcFinanceRequest(BaseModel):
    reason: Annotated[str, Field(min_length=1, max_length=4000)]


class AdminDealAgreedPricePatch(BaseModel):
    """Согласованная сумма сделки (копейки); если не задана — используется price при начислениях."""

    agreed_price_kopeks: Annotated[int, Field(gt=0)]
    reason: Annotated[str, Field(min_length=1, max_length=4000)]


class AdminEscrowActionRequest(BaseModel):
    """Запрос на эскроу-действие (Подтверждение_Получения / Распределение / Возврат).

    Причина обязательна (1–1000 символов) и не может состоять из одних
    пробельных символов.
    """

    reason: Annotated[str, Field(min_length=1, max_length=1000)]

    @model_validator(mode="after")
    def _reason_not_blank(self) -> "AdminEscrowActionRequest":
        if not self.reason.strip():
            raise ValueError("Причина не может состоять из пробелов")
        return self


class DealRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    worker_id: uuid.UUID
    bloger_id: uuid.UUID
    shop_link: str
    item_name: str
    status: DealStatus
    price: int
    seller_tg: str
    seller_number: str
    created_at: datetime
    client_contacted_at: datetime | None = None
    agreed_price_kopeks: int | None = None
    effective_price_kopeks: int = Field(
        description="Сумма для расчёта долей (agreed_price_kopeks или price)",
    )
    sensitive_masked: bool = Field(
        default=False,
        description="True — блогеру скрыты контакты заказчика и сумма до этапа подтверждения админом",
    )
    finance_visible: bool = Field(
        default=True,
        description="False — не показывать превью долей (до контакта с заказчиком)",
    )
    preview_worker_kopeks: int | None = None
    preview_blogger_kopeks: int | None = None
    preview_platform_kopeks: int | None = None
    rejection_reason: str | None = Field(
        default=None,
        description="Последняя причина отклонения сделки; null — причина не сохранена",
    )
