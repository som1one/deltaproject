from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.database import get_db
from enums.marketplace import BloggerCategory
from models.blogger_price_item import BloggerPriceItem
from models.blogger_profile import BloggerProfile
from models.marketplace_hero_config import MarketplaceHeroConfig
from models.marketplace_service_type import MarketplaceServiceType
from models.marketplace_settings import MarketplaceSettings
from models.user import User
from schemas.marketplace import (
    BloggerCardResponse,
    BloggerCatalogResponse,
    BloggerProfileResponse,
    HeroConfigPublicResponse,
    MarketplaceCategoryResponse,
    MarketplaceTariffsResponse,
    PriceItemPublic,
    ServiceTypeResponse,
)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])

# Площадки для чипа-карточки выводим из social_links (без отдельного поля в БД).
_PLATFORM_MATCHERS: list[tuple[str, tuple[str, ...]]] = [
    ("yt", ("youtube.com", "youtu.be")),
    ("tg", ("t.me", "telegram.me", "telegram.org")),
    ("ig", ("instagram.com",)),
    ("tt", ("tiktok.com",)),
]


def _platforms_from_links(links: list[str] | None) -> list[str]:
    joined = " ".join(links or []).lower()
    return [key for key, needles in _PLATFORM_MATCHERS if any(n in joined for n in needles)]


def _profile_gender(profile: BloggerProfile) -> str | None:
    gender = getattr(profile, "gender", None)
    return gender if gender in {"female", "male", "other"} else None


def _build_card(profile: BloggerProfile, name: str) -> BloggerCardResponse:
    return BloggerCardResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=name,
        category=profile.category,
        gender=_profile_gender(profile),
        subscriber_count=profile.subscriber_count,
        average_price_kopeks=profile.average_price_kopeks,
        photo_url=profile.photo_url,
        engagement_rate=(
            float(profile.engagement_rate) if profile.engagement_rate is not None else None
        ),
        rating=float(profile.rating) if profile.rating is not None else None,
        reviews_count=profile.reviews_count,
        platforms=_platforms_from_links(profile.social_links),
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        created_at=profile.created_at,
    )


async def _public_price_list(
    db: AsyncSession, profile_id: uuid.UUID
) -> list[PriceItemPublic]:
    """Включённые позиции прайс-листа автора для публичной карточки."""
    rows = (
        await db.execute(
            select(BloggerPriceItem, MarketplaceServiceType)
            .join(
                MarketplaceServiceType,
                MarketplaceServiceType.id == BloggerPriceItem.service_type_id,
            )
            .where(
                BloggerPriceItem.profile_id == profile_id,
                BloggerPriceItem.is_enabled.is_(True),
                MarketplaceServiceType.is_active.is_(True),
            )
            .order_by(MarketplaceServiceType.sort_order.asc())
        )
    ).all()
    return [
        PriceItemPublic(
            service_type_id=service_type.id,
            code=service_type.code,
            name=service_type.name,
            price_kopeks=item.price_kopeks,
            description=item.description,
        )
        for item, service_type in rows
    ]


@router.get("/service-types", response_model=list[ServiceTypeResponse])
async def list_service_types(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ServiceTypeResponse]:
    """Реестр услуг маркетплейса (для прайс-листов и оформления заказов)."""
    rows = (
        await db.execute(
            select(MarketplaceServiceType)
            .where(MarketplaceServiceType.is_active.is_(True))
            .order_by(MarketplaceServiceType.sort_order.asc())
        )
    ).scalars()
    return [ServiceTypeResponse.model_validate(st) for st in rows]


@router.get("/tariffs", response_model=MarketplaceTariffsResponse)
async def get_tariffs(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MarketplaceTariffsResponse:
    """Действующие тарифы платформы для публичных документов (оферта, условия).

    Читает singleton-настройки маркетплейса; если запись ещё не создана —
    возвращает базовые значения (совпадают с server_default модели).
    """
    row = (
        await db.execute(select(MarketplaceSettings).where(MarketplaceSettings.id == 1))
    ).scalar_one_or_none()
    if row is None:
        return MarketplaceTariffsResponse(
            platform_commission_pct=25.0,
            worker_referral_commission_pct=5.0,
            blogger_referral_commission_pct=5.0,
        )
    return MarketplaceTariffsResponse(
        platform_commission_pct=float(row.platform_commission_pct),
        worker_referral_commission_pct=float(row.worker_referral_commission_pct),
        blogger_referral_commission_pct=float(row.blogger_referral_commission_pct),
    )


@router.get("/categories", response_model=list[MarketplaceCategoryResponse])
async def list_categories() -> list[MarketplaceCategoryResponse]:
    return [
        MarketplaceCategoryResponse(value=category.value, label=category.label)
        for category in BloggerCategory
    ]


def _coerce_uuid_list(values) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for value in values or []:
        try:
            out.append(uuid.UUID(str(value)))
        except (ValueError, TypeError, AttributeError):
            continue
    return out


@router.get("/hero-config", response_model=HeroConfigPublicResponse)
async def get_hero_config(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HeroConfigPublicResponse:
    """Витрина лендинга с разрешёнными карточками авторов.

    Пустой ответ (списки пусты) → лендинг показывает демо-данные.
    """
    row = (
        await db.execute(select(MarketplaceHeroConfig).limit(1))
    ).scalar_one_or_none()
    if row is None:
        return HeroConfigPublicResponse()

    categories: list[MarketplaceCategoryResponse] = []
    for value in (row.featured_categories or [])[:3]:
        try:
            category = BloggerCategory(value)
        except ValueError:
            continue
        categories.append(MarketplaceCategoryResponse(value=category.value, label=category.label))

    all_ids = _coerce_uuid_list(row.featured_all)
    by_category_ids = {
        str(key): _coerce_uuid_list(ids) for key, ids in (row.featured_by_category or {}).items()
    }

    needed: set[uuid.UUID] = set(all_ids)
    for ids in by_category_ids.values():
        needed.update(ids)

    if not needed:
        return HeroConfigPublicResponse(categories=categories)

    result = await db.execute(
        select(BloggerProfile, User.name)
        .join(User, User.id == BloggerProfile.user_id)
        .where(BloggerProfile.user_id.in_(needed), BloggerProfile.is_active.is_(True))
    )
    cards: dict[uuid.UUID, BloggerCardResponse] = {
        profile.user_id: _build_card(profile, name) for profile, name in result.all()
    }

    def _resolve(ids: list[uuid.UUID]) -> list[BloggerCardResponse]:
        return [cards[i] for i in ids if i in cards]

    return HeroConfigPublicResponse(
        categories=categories,
        authors_all=_resolve(all_ids),
        authors_by_category={
            key: _resolve(ids) for key, ids in by_category_ids.items() if _resolve(ids)
        },
    )


@router.get("/bloggers", response_model=BloggerCatalogResponse)
async def list_bloggers(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
    category: str | None = Query(default=None, min_length=1, max_length=50),
    gender: Literal["female", "male", "other"] | None = None,
    q: str | None = Query(default=None, max_length=120),
    audience: Literal["nano", "micro", "macro", "mega"] | None = None,
    sort: Literal["rating", "price_asc", "price_desc", "audience_desc", "newest"] = "rating",
) -> BloggerCatalogResponse:
    # Карточка скрывается, когда автор её скрыл (is_active=False) или когда
    # аккаунт деактивирован админом; пауза приёма заказов показывается
    # бейджем, но не прячет карточку.
    conditions = [
        BloggerProfile.is_active.is_(True),
        User.is_active.is_(True),
    ]

    if category:
        conditions.append(BloggerProfile.category == category)

    if gender:
        conditions.append(BloggerProfile.gender == gender)

    if q:
        like = f"%{q.strip()}%"
        conditions.append(or_(User.name.ilike(like), BloggerProfile.description.ilike(like)))

    if audience == "nano":
        conditions.append(BloggerProfile.subscriber_count < 10_000)
    elif audience == "micro":
        conditions.append(BloggerProfile.subscriber_count.between(10_000, 99_999))
    elif audience == "macro":
        conditions.append(BloggerProfile.subscriber_count.between(100_000, 999_999))
    elif audience == "mega":
        conditions.append(BloggerProfile.subscriber_count >= 1_000_000)

    base = (
        select(BloggerProfile, User.name)
        .join(User, User.id == BloggerProfile.user_id)
        .where(*conditions)
    )

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar_one()

    if sort == "price_asc":
        base = base.order_by(BloggerProfile.average_price_kopeks.asc())
    elif sort == "price_desc":
        base = base.order_by(BloggerProfile.average_price_kopeks.desc())
    elif sort == "audience_desc":
        base = base.order_by(BloggerProfile.subscriber_count.desc())
    elif sort == "newest":
        base = base.order_by(BloggerProfile.created_at.desc())
    else:
        base = base.order_by(BloggerProfile.subscriber_count.desc(), BloggerProfile.created_at.desc())

    result = await db.execute(
        base.offset((page - 1) * page_size).limit(page_size)
    )

    items = [_build_card(profile, name) for profile, name in result.all()]

    return BloggerCatalogResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/bloggers/{blogger_user_id}", response_model=BloggerProfileResponse)
async def get_blogger(
    blogger_user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerProfileResponse:
    result = await db.execute(
        select(BloggerProfile, User.name)
        .join(User, User.id == BloggerProfile.user_id)
        .where(
            BloggerProfile.user_id == blogger_user_id,
            BloggerProfile.is_active.is_(True),
            User.is_active.is_(True),
        )
    )
    row = result.one_or_none()
    if row is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль блогера не найден",
        )

    profile, name = row
    return BloggerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=name,
        category=profile.category,
        gender=_profile_gender(profile),
        subscriber_count=profile.subscriber_count,
        average_price_kopeks=profile.average_price_kopeks,
        engagement_rate=(
            float(profile.engagement_rate) if profile.engagement_rate is not None else None
        ),
        rating=float(profile.rating) if profile.rating is not None else None,
        reviews_count=profile.reviews_count,
        description=profile.description,
        # Автор управляет видимостью блоков публичной карточки
        portfolio_links=(profile.portfolio_links or []) if profile.show_portfolio else [],
        portfolio_covers=(profile.portfolio_covers or []) if profile.show_portfolio else [],
        social_links=(profile.social_links or []) if profile.show_socials else [],
        photo_url=profile.photo_url,
        # Контакты автора наружу не отдаём: общение сторон — только в чате
        # платформы. Поле остаётся в схеме ради совместимости клиентов.
        preferred_contact=None,
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        price_list=await _public_price_list(db, profile.id),
        audience_stats=profile.audience_stats,
        audience_verified_at=profile.audience_verified_at,
        show_portfolio=profile.show_portfolio,
        show_socials=profile.show_socials,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )
