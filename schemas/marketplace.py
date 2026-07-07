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
    created_at: datetime


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
    social_links: list[str]
    photo_url: str | None = None
    preferred_contact: str | None = None
    is_active: bool
    orders_enabled: bool
    created_at: datetime
    updated_at: datetime


class BloggerProfileCreateRequest(BaseModel):
    """Запрос на создание профиля блогера (онбординг)."""

    category: Annotated[str, Field(min_length=1, max_length=50)]
    gender: BloggerGender | None = None
    subscriber_count: Annotated[int, Field(ge=1, le=999_000_000)]
    average_price_kopeks: Annotated[int, Field(ge=100, le=1_000_000_000)]
    description: Annotated[str, Field(min_length=1, max_length=500)]
    social_links: Annotated[list[str], Field(min_length=1, max_length=10)]
    portfolio_links: Annotated[list[str] | None, Field(max_length=5)] = None
    photo_url: str | None = None
    preferred_contact: Annotated[str | None, Field(max_length=100)] = None

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
    photo_url: str | None = None
    preferred_contact: Annotated[str | None, Field(max_length=100)] = None
    is_active: bool | None = None
    orders_enabled: bool | None = None

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
