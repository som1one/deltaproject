from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, HttpUrl


BloggerGender = Literal["female", "male", "other"]


class BloggerCardResponse(BaseModel):
    """Карточка блогера в каталоге маркетплейса."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    category: str
    gender: BloggerGender | None = None
    subscriber_count: int
    average_price_kopeks: int
    photo_url: str | None = None
    # Витринные метрики (опциональны — выводятся, если заданы).
    engagement_rate: float | None = None
    rating: float | None = None
    reviews_count: int = 0
    platforms: list[str] = Field(default_factory=list)
    is_active: bool
    orders_enabled: bool = True
    created_at: datetime


class ServiceTypeResponse(BaseModel):
    """Тип услуги из реестра (публичный)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    code: str
    name: str
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class PriceItemPublic(BaseModel):
    """Позиция прайс-листа автора в публичной карточке."""

    service_type_id: uuid.UUID
    code: str
    name: str
    price_kopeks: int
    description: str | None = None


class PriceItemInput(BaseModel):
    """Позиция прайс-листа при сохранении автором."""

    service_type_id: uuid.UUID
    price_kopeks: Annotated[int, Field(ge=100, le=1_000_000_000)]
    description: Annotated[str | None, Field(max_length=300)] = None
    is_enabled: bool = True


class PriceItemFull(PriceItemPublic):
    """Позиция прайс-листа в кабинете автора (включая выключенные)."""

    id: uuid.UUID
    is_enabled: bool = True


class PriceListUpdateRequest(BaseModel):
    """Полная замена прайс-листа автора."""

    items: Annotated[list[PriceItemInput], Field(max_length=30)]

    @field_validator("items")
    @classmethod
    def no_duplicate_services(cls, v: list[PriceItemInput]) -> list[PriceItemInput]:
        seen = {item.service_type_id for item in v}
        if len(seen) != len(v):
            raise ValueError("Один тип услуги не может повторяться в прайс-листе")
        return v


class AudienceGroupItem(BaseModel):
    """Группа аудитории с процентом (возраст, гео, устройства)."""

    label: Annotated[str, Field(min_length=1, max_length=60)]
    percent: Annotated[float, Field(ge=0, le=100)]


class AudienceGenderSplit(BaseModel):
    female: Annotated[float, Field(ge=0, le=100)]
    male: Annotated[float, Field(ge=0, le=100)]


class AudiencePayload(BaseModel):
    """Данные аудитории, заполняемые автором от руки."""

    audience_age: Annotated[list[AudienceGroupItem] | None, Field(max_length=8)] = None
    audience_gender: AudienceGenderSplit | None = None
    audience_geo: Annotated[list[AudienceGroupItem] | None, Field(max_length=8)] = None
    audience_devices: Annotated[list[AudienceGroupItem] | None, Field(max_length=5)] = None
    avg_views: Annotated[int | None, Field(ge=0, le=1_000_000_000)] = None
    posting_frequency: Annotated[str | None, Field(max_length=100)] = None
    response_time: Annotated[str | None, Field(max_length=100)] = None
    subscriber_count: Annotated[int | None, Field(ge=1, le=999_000_000)] = None


class AudienceSubmissionCreateRequest(BaseModel):
    """Заявка автора на подтверждение статистики аудитории."""

    payload: AudiencePayload
    screenshots: Annotated[list[str], Field(min_length=1, max_length=10)]

    @field_validator("screenshots")
    @classmethod
    def validate_screenshots(cls, v: list[str]) -> list[str]:
        for link in v:
            if not link or not (
                link.startswith(("http://", "https://")) or link.startswith("/uploads/")
            ):
                raise ValueError(f"Некорректная ссылка на скриншот: {link}")
        return v


class AudienceSubmissionResponse(BaseModel):
    """Заявка на аудиторию (кабинет автора и админка)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    profile_id: uuid.UUID
    status: str
    payload: dict
    screenshots: list[str] = Field(default_factory=list)
    review_comment: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class ServiceTypeCreateRequest(BaseModel):
    """Создание типа услуги в реестре (админ)."""

    code: Annotated[str, Field(min_length=1, max_length=50, pattern=r"^[a-z0-9_\-]+$")]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    description: Annotated[str | None, Field(max_length=300)] = None
    sort_order: Annotated[int, Field(ge=0, le=10_000)] = 0
    is_active: bool = True


class ServiceTypeUpdateRequest(BaseModel):
    """Частичное обновление типа услуги (админ)."""

    name: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    description: Annotated[str | None, Field(max_length=300)] = None
    sort_order: Annotated[int | None, Field(ge=0, le=10_000)] = None
    is_active: bool | None = None


class AudienceSubmissionAdminItem(AudienceSubmissionResponse):
    """Заявка на аудиторию в админке — с данными автора."""

    blogger_user_id: uuid.UUID
    blogger_name: str
    blogger_category: str | None = None
    subscriber_count: int | None = None


class AudienceSubmissionResolveRequest(BaseModel):
    """Решение по заявке на аудиторию."""

    action: Literal["approve", "reject"]
    comment: Annotated[str | None, Field(max_length=1000)] = None


class PremiumRequestAdminItem(BaseModel):
    """Заявка на премиум-размещение в админке — с данными автора."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    comment: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    blogger_name: str | None = None
    blogger_email: str | None = None


class PremiumRequestResolveRequest(BaseModel):
    """Смена статуса премиум-заявки админом."""

    status: Literal["contacted", "closed"]


class PremiumRequestCreate(BaseModel):
    """Заявка на премиум-размещение на главной."""

    comment: Annotated[str | None, Field(max_length=1000)] = None


class PremiumRequestResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    status: str
    comment: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class BloggerProfileResponse(BaseModel):
    """Полный профиль блогера (детальная страница)."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    category: str
    gender: BloggerGender | None = None
    subscriber_count: int
    average_price_kopeks: int
    engagement_rate: float | None = None
    rating: float | None = None
    reviews_count: int = 0
    description: str
    portfolio_links: list[str] = Field(default_factory=list)
    # Обложки работ — параллельно portfolio_links; None = обложки нет.
    portfolio_covers: list[str | None] = Field(default_factory=list)
    social_links: list[str]
    photo_url: str | None = None
    preferred_contact: str | None = None
    is_active: bool
    orders_enabled: bool
    # Прайс-лист по типам услуг из реестра (только включённые позиции).
    price_list: list[PriceItemPublic] = Field(default_factory=list)
    # Подтверждённая админом статистика аудитории.
    audience_stats: dict | None = None
    audience_verified_at: datetime | None = None
    show_portfolio: bool = True
    show_socials: bool = True
    created_at: datetime
    updated_at: datetime


class BloggerSelfProfileResponse(BloggerProfileResponse):
    """Профиль в кабинете автора: полный прайс и статус заявки на аудиторию."""

    price_list_full: list[PriceItemFull] = Field(default_factory=list)
    latest_audience_submission: AudienceSubmissionResponse | None = None


def _clean_portfolio_covers(v: list[str | None] | None) -> list[str | None] | None:
    """Обложки портфолио: пустые строки → None, ссылки — /uploads/ или http(s)."""
    if v is None:
        return v
    if len(v) > 5:
        raise ValueError("Максимум 5 обложек портфолио")
    cleaned: list[str | None] = []
    for cover in v:
        if cover is None or not str(cover).strip():
            cleaned.append(None)
            continue
        url = str(cover).strip()
        if len(url) > 2048:
            raise ValueError("Слишком длинная ссылка на обложку")
        if not url.startswith(("/uploads/", "http://", "https://")):
            raise ValueError(f"Некорректная ссылка на обложку: {url}")
        cleaned.append(url)
    return cleaned


class BloggerProfileCreateRequest(BaseModel):
    """Запрос на создание профиля блогера (онбординг)."""

    category: Annotated[str, Field(min_length=1, max_length=50)]
    gender: BloggerGender | None = None
    subscriber_count: Annotated[int, Field(ge=1, le=999_000_000)]
    average_price_kopeks: Annotated[int, Field(ge=100, le=1_000_000_000)]
    description: Annotated[str, Field(min_length=1, max_length=500)]
    social_links: Annotated[list[str], Field(min_length=1, max_length=10)]
    portfolio_links: Annotated[list[str] | None, Field(max_length=5)] = None
    portfolio_covers: Annotated[list[str | None] | None, Field(max_length=5)] = None
    photo_url: str | None = None
    preferred_contact: Annotated[str | None, Field(max_length=100)] = None

    @field_validator("portfolio_covers", mode="before")
    @classmethod
    def validate_portfolio_covers(cls, v: list[str | None] | None) -> list[str | None] | None:
        return _clean_portfolio_covers(v)

    @field_validator("social_links", mode="before")
    @classmethod
    def validate_social_links(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Необходимо указать хотя бы одну ссылку на соцсеть")
        if len(v) > 10:
            raise ValueError("Максимум 10 ссылок на соцсети")
        for link in v:
            # Basic URL validation
            if not link or not link.startswith(("http://", "https://")):
                raise ValueError(f"Некорректный URL: {link}")
        return v

    @field_validator("portfolio_links", mode="before")
    @classmethod
    def validate_portfolio_links(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) > 5:
            raise ValueError("Максимум 5 ссылок на портфолио")
        for link in v:
            if not link or not link.startswith(("http://", "https://")):
                raise ValueError(f"Некорректный URL портфолио: {link}")
        return v


class BloggerProfileUpdateRequest(BaseModel):
    """Запрос на обновление профиля блогера (частичное обновление)."""

    category: Annotated[str | None, Field(min_length=1, max_length=50)] = None
    gender: BloggerGender | None = None
    subscriber_count: Annotated[int | None, Field(ge=1, le=999_000_000)] = None
    average_price_kopeks: Annotated[int | None, Field(ge=100, le=1_000_000_000)] = None
    engagement_rate: Annotated[float | None, Field(ge=0, le=100)] = None
    rating: Annotated[float | None, Field(ge=0, le=5)] = None
    reviews_count: Annotated[int | None, Field(ge=0, le=1_000_000)] = None
    description: Annotated[str | None, Field(min_length=1, max_length=500)] = None
    social_links: Annotated[list[str] | None, Field(min_length=1, max_length=10)] = None
    portfolio_links: Annotated[list[str] | None, Field(max_length=5)] = None
    portfolio_covers: Annotated[list[str | None] | None, Field(max_length=5)] = None
    photo_url: str | None = None
    preferred_contact: Annotated[str | None, Field(max_length=100)] = None
    is_active: bool | None = None
    orders_enabled: bool | None = None
    show_portfolio: bool | None = None
    show_socials: bool | None = None

    @field_validator("portfolio_covers", mode="before")
    @classmethod
    def validate_portfolio_covers(cls, v: list[str | None] | None) -> list[str | None] | None:
        return _clean_portfolio_covers(v)

    @field_validator("social_links", mode="before")
    @classmethod
    def validate_social_links(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("Необходимо указать хотя бы одну ссылку на соцсеть")
        if len(v) > 10:
            raise ValueError("Максимум 10 ссылок на соцсети")
        for link in v:
            if not link or not link.startswith(("http://", "https://")):
                raise ValueError(f"Некорректный URL: {link}")
        return v

    @field_validator("portfolio_links", mode="before")
    @classmethod
    def validate_portfolio_links(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) > 5:
            raise ValueError("Максимум 5 ссылок на портфолио")
        for link in v:
            if not link or not link.startswith(("http://", "https://")):
                raise ValueError(f"Некорректный URL портфолио: {link}")
        return v


class BloggerProfileSelfUpdateRequest(BloggerProfileUpdateRequest):
    """Самостоятельное обновление профиля автором.

    Витринные метрики (рейтинг, ER, число отзывов) исключены — их
    считает платформа; автор не может накрутить их через PATCH.
    """

    engagement_rate: None = None
    rating: None = None
    reviews_count: None = None


class BloggerCatalogResponse(BaseModel):
    """Ответ каталога блогеров с пагинацией."""

    items: list[BloggerCardResponse]
    total: int
    page: int
    page_size: int


class MarketplaceCategoryResponse(BaseModel):
    """Публичная категория маркетплейса для фильтров и форм."""

    value: str
    label: str


class HeroConfigPublicResponse(BaseModel):
    """Витрина лендинга с уже разрешёнными карточками авторов.

    Пустые списки означают «не настроено» — лендинг покажет демо-данные.
    """

    categories: list[MarketplaceCategoryResponse] = Field(default_factory=list)
    authors_all: list[BloggerCardResponse] = Field(default_factory=list)
    authors_by_category: dict[str, list[BloggerCardResponse]] = Field(default_factory=dict)
