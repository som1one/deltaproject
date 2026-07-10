from __future__ import annotations

import uuid
from decimal import Decimal
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator, model_validator

from enums.marketplace import MarketplaceOrderStatus
from schemas.marketplace_payment_settings import CardRequisitesPublic
from schemas.settlement_account import SettlementAccountResponse


class OrderCreateRequest(BaseModel):
    """Запрос на создание заказа (оффер от заказчика из карточки автора)."""

    blogger_id: uuid.UUID
    message: Annotated[str, Field(min_length=1, max_length=1000)]
    amount_kopeks: int = Field(..., ge=100, le=1_000_000_000)
    service_type_id: uuid.UUID | None = None
    deadline_days: Annotated[int | None, Field(ge=1, le=90)] = None
    publish_at: datetime | None = None


class OfferCreateRequest(BaseModel):
    """Оффер из чата: услугу может предложить и заказчик, и блогер."""

    counterpart_id: uuid.UUID
    message: Annotated[str, Field(min_length=1, max_length=1000)]
    amount_kopeks: int = Field(..., ge=100, le=1_000_000_000)
    service_type_id: uuid.UUID | None = None
    deadline_days: Annotated[int | None, Field(ge=1, le=90)] = None
    publish_at: datetime | None = None


class OfferDeclineRequest(BaseModel):
    """Отказ от оффера с необязательной причиной."""

    reason: Annotated[str | None, Field(max_length=1000)] = None


class SubmitWorkRequest(BaseModel):
    """Сдача работы блогером: ссылка на публикацию и/или комментарий."""

    result: Annotated[str, Field(min_length=1, max_length=2000)]

    @field_validator("result")
    @classmethod
    def result_not_whitespace(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Опишите результат или приложите ссылку на публикацию")
        return v


class RequestChangesRequest(BaseModel):
    """Возврат работы на доработку — причина обязательна."""

    reason: Annotated[str, Field(min_length=1, max_length=1000)]

    @field_validator("reason")
    @classmethod
    def reason_not_whitespace(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Укажите причину возврата на доработку")
        return v


class ReviewCreateRequest(BaseModel):
    """Отзыв по завершённой сделке."""

    rating: Annotated[int, Field(ge=1, le=5)]
    text: Annotated[str | None, Field(max_length=1000)] = None


class ReviewResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    order_id: uuid.UUID
    author_id: uuid.UUID
    target_id: uuid.UUID
    rating: int
    text: str | None = None
    created_at: datetime


class OrderResponse(BaseModel):
    """Ответ с данными заказа."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    client_id: uuid.UUID
    blogger_id: uuid.UUID
    worker_id: uuid.UUID | None = None
    status: MarketplaceOrderStatus
    amount_kopeks: int
    message: str
    platform_commission_pct: float
    worker_commission_pct: float
    yookassa_payment_id: str | None = None
    payment_url: str | None = None
    payment_expires_at: datetime | None = None
    payment_reported_at: datetime | None = None
    # Полный цикл: услуга, оффер, сроки, сдача работы, окно приёмки
    service_type_id: uuid.UUID | None = None
    service_type_name: str | None = None
    offered_by: uuid.UUID | None = None
    deadline_days: int | None = None
    publish_at: datetime | None = None
    accepted_at: datetime | None = None
    deadline_at: datetime | None = None
    work_submitted_at: datetime | None = None
    work_result: str | None = None
    review_deadline_at: datetime | None = None
    decline_reason: str | None = None
    created_at: datetime
    paid_at: datetime | None = None
    blogger_confirmed_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime
    blogger_name: str | None = None
    client_name: str | None = None


class OrderListResponse(BaseModel):
    """Список заказов с пагинацией."""

    items: list[OrderResponse]
    total: int
    page: int
    page_size: int


class OrderDetailResponse(OrderResponse):
    """Расширенный ответ с деталями заказа, включая реквизиты оплаты и доступные действия."""

    settlement_account: SettlementAccountResponse | None = None
    card_requisites: CardRequisitesPublic | None = None
    yookassa_available: bool = False
    available_actions: list[str] = []
    # Отзывы по завершённой сделке: свой и адресованный текущему пользователю
    my_review: ReviewResponse | None = None
    review_of_me: ReviewResponse | None = None


class RefundRequest(BaseModel):
    """Запрос на возврат средств по заказу."""

    reason: str = Field(..., min_length=1, max_length=1000, description="Причина возврата (1–1000 символов)")

    @field_validator("reason")
    @classmethod
    def reason_not_whitespace(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Причина не может состоять только из пробелов")
        return v


class CommissionSettingsUpdate(BaseModel):
    """Обновление настроек комиссий платформы и воркера."""

    platform_commission_pct: Decimal = Field(
        ...,
        ge=Decimal("1"),
        le=Decimal("50"),
        decimal_places=2,
        description="Комиссия платформы (1–50%, до 2 знаков после запятой)",
    )
    worker_commission_pct: Decimal = Field(
        ...,
        ge=Decimal("1"),
        le=Decimal("30"),
        decimal_places=2,
        description="Комиссия воркера (1–30%, до 2 знаков после запятой)",
    )

    @model_validator(mode="after")
    def check_total(self) -> "CommissionSettingsUpdate":
        if self.platform_commission_pct + self.worker_commission_pct > Decimal("80"):
            raise ValueError("Сумма комиссий не может превышать 80%")
        return self


class CommissionSettingsReadResponse(BaseModel):
    """Ответ с текущими настройками комиссий (для /commission-settings)."""

    platform_commission_pct: Decimal
    worker_commission_pct: Decimal
