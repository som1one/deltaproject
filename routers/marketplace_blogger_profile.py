"""Профиль автора на маркетплейсе: самостоятельное управление карточкой.

Аватар, описание, соцсети, портфолио, видимость карточки и приём заказов,
прайс-лист по типам услуг из реестра и заявки на подтверждение аудитории
(модерируются админом).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_blogger
from dependencies.database import get_db
from enums.marketplace import AudienceSubmissionStatus
from enums.user import UserRole
from models.blogger_audience_submission import BloggerAudienceSubmission
from models.blogger_price_item import BloggerPriceItem
from models.blogger_profile import BloggerProfile
from models.marketplace_service_type import MarketplaceServiceType
from models.user import User
from schemas.marketplace import (
    AudienceSubmissionCreateRequest,
    AudienceSubmissionResponse,
    BloggerProfileCreateRequest,
    BloggerProfileSelfUpdateRequest,
    BloggerSelfProfileResponse,
    PriceItemFull,
    PriceListUpdateRequest,
)
from services import notification_service

router = APIRouter(prefix="/marketplace/blogger", tags=["marketplace-blogger-profile"])

# Витринные метрики автор менять не может — их считает платформа.
_SELF_UPDATE_FORBIDDEN = {"engagement_rate", "rating", "reviews_count"}


def _profile_gender(profile: BloggerProfile) -> str | None:
    gender = getattr(profile, "gender", None)
    return gender if gender in {"female", "male", "other"} else None


async def _get_profile_or_404(db: AsyncSession, user_id: uuid.UUID) -> BloggerProfile:
    profile = (
        await db.execute(select(BloggerProfile).where(BloggerProfile.user_id == user_id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль маркетплейса не заполнен",
        )
    return profile


async def _price_list_full(
    db: AsyncSession, profile_id: uuid.UUID
) -> list[PriceItemFull]:
    rows = (
        await db.execute(
            select(BloggerPriceItem, MarketplaceServiceType)
            .join(
                MarketplaceServiceType,
                MarketplaceServiceType.id == BloggerPriceItem.service_type_id,
            )
            .where(BloggerPriceItem.profile_id == profile_id)
            .order_by(MarketplaceServiceType.sort_order.asc())
        )
    ).all()
    return [
        PriceItemFull(
            id=item.id,
            service_type_id=service_type.id,
            code=service_type.code,
            name=service_type.name,
            price_kopeks=item.price_kopeks,
            description=item.description,
            is_enabled=item.is_enabled,
        )
        for item, service_type in rows
    ]


async def _latest_submission(
    db: AsyncSession, profile_id: uuid.UUID
) -> AudienceSubmissionResponse | None:
    submission = (
        await db.execute(
            select(BloggerAudienceSubmission)
            .where(BloggerAudienceSubmission.profile_id == profile_id)
            .order_by(BloggerAudienceSubmission.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if submission is None:
        return None
    return AudienceSubmissionResponse.model_validate(submission)


def _align_covers(covers: list[str | None], links: list[str]) -> list[str | None]:
    """Обложки строго параллельны ссылкам: обрезаем лишнее, добиваем None."""
    return (list(covers) + [None] * len(links))[: len(links)]


async def _self_profile_response(
    db: AsyncSession, profile: BloggerProfile, user: User
) -> BloggerSelfProfileResponse:
    price_list_full = await _price_list_full(db, profile.id)
    return BloggerSelfProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=user.name,
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
        portfolio_links=profile.portfolio_links or [],
        portfolio_covers=profile.portfolio_covers or [],
        social_links=profile.social_links or [],
        photo_url=profile.photo_url,
        preferred_contact=profile.preferred_contact,
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        price_list=[item for item in price_list_full if item.is_enabled],
        audience_stats=profile.audience_stats,
        audience_verified_at=profile.audience_verified_at,
        show_portfolio=profile.show_portfolio,
        show_socials=profile.show_socials,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        price_list_full=price_list_full,
        latest_audience_submission=await _latest_submission(db, profile.id),
    )


@router.get("/profile", response_model=BloggerSelfProfileResponse)
async def get_own_profile(
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerSelfProfileResponse:
    """Собственный профиль автора: карточка, прайс-лист, статус заявки на аудиторию."""
    profile = await _get_profile_or_404(db, user.id)
    return await _self_profile_response(db, profile, user)


@router.post(
    "/profile",
    response_model=BloggerSelfProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_profile(
    body: BloggerProfileCreateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerSelfProfileResponse:
    """Создать/заполнить профиль автора на маркетплейсе (онбординг)."""
    existing = (
        await db.execute(select(BloggerProfile).where(BloggerProfile.user_id == user.id))
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Профиль маркетплейса уже существует",
        )

    links = body.portfolio_links or []
    covers = _align_covers(body.portfolio_covers or [], links)
    profile = BloggerProfile(
        user_id=user.id,
        category=body.category,
        gender=body.gender,
        subscriber_count=body.subscriber_count,
        average_price_kopeks=body.average_price_kopeks,
        description=body.description,
        social_links=body.social_links,
        portfolio_links=links,
        portfolio_covers=covers,
        photo_url=body.photo_url,
        preferred_contact=body.preferred_contact,
    )

    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return await _self_profile_response(db, profile, user)


@router.patch("/profile", response_model=BloggerSelfProfileResponse)
async def update_profile(
    body: BloggerProfileSelfUpdateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerSelfProfileResponse:
    """Обновить профиль автора (частичное обновление).

    Управляет и видимостью: is_active — показать/скрыть карточку в каталоге,
    orders_enabled — принимать ли новые заказы, show_portfolio/show_socials —
    видимость блоков в публичной карточке.
    """
    profile = await _get_profile_or_404(db, user.id)

    update_data = body.model_dump(exclude_unset=True, exclude=_SELF_UPDATE_FORBIDDEN)

    # Явный null на NOT NULL-колонках дал бы IntegrityError → 500;
    # такие значения молча отбрасываем (частичное обновление).
    non_nullable = {
        "category",
        "subscriber_count",
        "average_price_kopeks",
        "description",
        "social_links",
        "portfolio_links",
        "portfolio_covers",
        "is_active",
        "orders_enabled",
        "show_portfolio",
        "show_socials",
    }
    update_data = {
        field: value
        for field, value in update_data.items()
        if not (value is None and field in non_nullable)
    }

    # Обложки всегда параллельны ссылкам — независимо от того, что из пары
    # пришло в этом PATCH (лишнее обрезаем, недостающее добиваем None).
    if "portfolio_links" in update_data or "portfolio_covers" in update_data:
        links = update_data.get("portfolio_links", profile.portfolio_links or [])
        covers = update_data.get("portfolio_covers", profile.portfolio_covers or [])
        update_data["portfolio_covers"] = _align_covers(covers, links)

    # Число подписчиков после подтверждения аудитории фиксирует админ;
    # самостоятельное изменение снимает бейдж «подтверждено».
    if (
        "subscriber_count" in update_data
        and update_data["subscriber_count"] != profile.subscriber_count
    ):
        profile.audience_verified_at = None

    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    return await _self_profile_response(db, profile, user)


@router.put("/price-list", response_model=list[PriceItemFull])
async def update_price_list(
    body: PriceListUpdateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PriceItemFull]:
    """Полная замена прайс-листа автора.

    Каждая позиция ссылается на тип услуги из реестра. Средняя цена
    в карточке пересчитывается как минимум включённых позиций («от ...»).
    """
    profile = await _get_profile_or_404(db, user.id)

    # Валидация типов услуг: существуют и активны
    if body.items:
        service_type_ids = [item.service_type_id for item in body.items]
        active_types = {
            st.id
            for st in (
                await db.execute(
                    select(MarketplaceServiceType).where(
                        MarketplaceServiceType.id.in_(service_type_ids),
                        MarketplaceServiceType.is_active.is_(True),
                    )
                )
            ).scalars()
        }
        missing = set(service_type_ids) - active_types
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Некоторые типы услуг не найдены в реестре",
            )

    # Полная замена: удалить старые, вставить новые
    existing_items = (
        await db.execute(
            select(BloggerPriceItem).where(BloggerPriceItem.profile_id == profile.id)
        )
    ).scalars().all()
    for item in existing_items:
        await db.delete(item)
    await db.flush()

    for item in body.items:
        db.add(
            BloggerPriceItem(
                profile_id=profile.id,
                service_type_id=item.service_type_id,
                price_kopeks=item.price_kopeks,
                description=item.description,
                is_enabled=item.is_enabled,
            )
        )

    # «от ...» в карточке каталога = минимальная включённая цена
    enabled_prices = [i.price_kopeks for i in body.items if i.is_enabled]
    if enabled_prices:
        profile.average_price_kopeks = min(enabled_prices)

    await db.commit()

    return await _price_list_full(db, profile.id)


@router.post(
    "/audience-submission",
    response_model=AudienceSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_audience_submission(
    body: AudienceSubmissionCreateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AudienceSubmissionResponse:
    """Подать заявку на подтверждение статистики аудитории.

    Данные заполняются от руки и подкрепляются скриншотами из статистики
    площадки. Заявка уходит в админку; после одобрения данные появятся
    в публичной карточке с пометкой «подтверждено».
    """
    profile = await _get_profile_or_404(db, user.id)

    pending = (
        await db.execute(
            select(BloggerAudienceSubmission).where(
                BloggerAudienceSubmission.profile_id == profile.id,
                BloggerAudienceSubmission.status
                == AudienceSubmissionStatus.PENDING.value,
            )
        )
    ).scalar_one_or_none()
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="У вас уже есть заявка на модерации — дождитесь решения",
        )

    submission = BloggerAudienceSubmission(
        profile_id=profile.id,
        payload=body.payload.model_dump(exclude_none=True),
        screenshots=body.screenshots,
    )
    db.add(submission)
    await db.flush()

    # Уведомляем администраторов о новой заявке
    admins = (
        await db.execute(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
    ).all()
    for (admin_id,) in admins:
        await notification_service.notify(
            db=db,
            user_id=admin_id,
            event_type="audience_submission_created",
            payload={"submission_id": str(submission.id), "blogger_name": user.name},
        )

    await db.commit()
    await db.refresh(submission)
    return AudienceSubmissionResponse.model_validate(submission)


@router.get("/audience-submission", response_model=AudienceSubmissionResponse)
async def get_latest_audience_submission(
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AudienceSubmissionResponse:
    """Последняя заявка автора на подтверждение аудитории."""
    profile = await _get_profile_or_404(db, user.id)
    submission = await _latest_submission(db, profile.id)
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявок на подтверждение аудитории ещё не было",
        )
    return submission
