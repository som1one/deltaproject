from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_blogger
from dependencies.database import get_db
from models.blogger_profile import BloggerProfile
from models.user import User
from schemas.marketplace import (
    BloggerProfileCreateRequest,
    BloggerProfileResponse,
    BloggerProfileUpdateRequest,
)

router = APIRouter(prefix="/marketplace/blogger", tags=["marketplace-blogger-profile"])


def _profile_gender(profile: BloggerProfile) -> str | None:
    gender = getattr(profile, "gender", None)
    return gender if gender in {"female", "male", "other"} else None


@router.get("/profile", response_model=BloggerProfileResponse)
async def get_own_profile(
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerProfileResponse:
    """Получить собственный профиль блогера на маркетплейсе."""
    query = select(BloggerProfile).where(BloggerProfile.user_id == user.id)
    result = await db.execute(query)
    profile = result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль маркетплейса не заполнен",
        )

    return BloggerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=user.name,
        category=profile.category,
        gender=_profile_gender(profile),
        subscriber_count=profile.subscriber_count,
        average_price_kopeks=profile.average_price_kopeks,
        description=profile.description,
        portfolio_links=profile.portfolio_links or [],
        social_links=profile.social_links,
        photo_url=profile.photo_url,
        preferred_contact=profile.preferred_contact,
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.post(
    "/profile",
    response_model=BloggerProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_profile(
    body: BloggerProfileCreateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerProfileResponse:
    """Создать/заполнить профиль блогера на маркетплейсе (онбординг)."""
    # Check if profile already exists
    existing_query = select(BloggerProfile).where(BloggerProfile.user_id == user.id)
    existing_result = await db.execute(existing_query)
    existing_profile = existing_result.scalar_one_or_none()

    if existing_profile is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Профиль маркетплейса уже существует",
        )

    profile = BloggerProfile(
        user_id=user.id,
        category=body.category,
        gender=body.gender,
        subscriber_count=body.subscriber_count,
        average_price_kopeks=body.average_price_kopeks,
        description=body.description,
        social_links=body.social_links,
        portfolio_links=body.portfolio_links or [],
        photo_url=body.photo_url,
        preferred_contact=body.preferred_contact,
    )

    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return BloggerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=user.name,
        category=profile.category,
        gender=_profile_gender(profile),
        subscriber_count=profile.subscriber_count,
        average_price_kopeks=profile.average_price_kopeks,
        description=profile.description,
        portfolio_links=profile.portfolio_links or [],
        social_links=profile.social_links,
        photo_url=profile.photo_url,
        preferred_contact=profile.preferred_contact,
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.patch("/profile", response_model=BloggerProfileResponse)
async def update_profile(
    body: BloggerProfileUpdateRequest,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerProfileResponse:
    """Обновить поля профиля блогера на маркетплейсе (частичное обновление)."""
    query = select(BloggerProfile).where(BloggerProfile.user_id == user.id)
    result = await db.execute(query)
    profile = result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль маркетплейса не заполнен",
        )

    # Apply only provided (non-None) fields
    update_data = body.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)

    return BloggerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=user.name,
        category=profile.category,
        gender=_profile_gender(profile),
        subscriber_count=profile.subscriber_count,
        average_price_kopeks=profile.average_price_kopeks,
        description=profile.description,
        portfolio_links=profile.portfolio_links or [],
        social_links=profile.social_links,
        photo_url=profile.photo_url,
        preferred_contact=profile.preferred_contact,
        is_active=profile.is_active,
        orders_enabled=profile.orders_enabled,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )
