from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field


class AdminPaymentDetailsSet(BaseModel):
    """Запрос на сохранение реквизитов приёма платежей (set/replace).

    Различие «реквизит не передан» (оставить прежним) и «передан как пустая
    строка» (очистить) определяется сервисом через ``model_fields_set``.
    Точная валидация (Luhn 13–19 цифр для карты, абсолютный HTTPS-URL для
    ссылки) выполняется в сервисе, а не в схеме.
    """

    collection_card: Annotated[str | None, Field(default=None, max_length=64)] = None
    payment_link: Annotated[str | None, Field(default=None, max_length=2048)] = None


class AdminPaymentDetailsRead(BaseModel):
    """Маскированное представление реквизитов приёма (без полного PAN)."""

    payment_link: str | None = None
    collection_card_last4: str | None = None
    is_active: bool


class PaymentRequisites(BaseModel):
    """Реквизиты приёма для предъявления плательщику по сделке.

    Полный номер Карты_Приёма (``collection_card_full``) отдаётся только
    авторизованным получателям по сделке в статусе ``CONFIRMED``
    (работнику/блогеру сделки и администратору).
    """

    collection_card_full: str | None = None
    payment_link: str | None = None
    available: bool
