"""Заявки на премиум-размещение на главной странице маркетплейса.

Автор оставляет заявку из кабинета; админ видит её в панели, связывается
с автором и после договорённости вручную добавляет его в hero-config.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_blogger
from dependencies.database import get_db
from enums.marketplace import PremiumRequestStatus
from enums.user import UserRole
from models.marketplace_premium_request import MarketplacePremiumRequest
from models.user import User
from schemas.marketplace import PremiumRequestCreate, PremiumRequestResponse
from services import notification_service

router = APIRouter(prefix="/marketplace/premium", tags=["marketplace-premium"])


@router.post(
    "/requests",
    response_model=PremiumRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_premium_request(
    body: PremiumRequestCreate,
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PremiumRequestResponse:
    """Оставить заявку на премиум-размещение на главной."""
    existing = (
        await db.execute(
            select(MarketplacePremiumRequest).where(
                MarketplacePremiumRequest.user_id == user.id,
                MarketplacePremiumRequest.status == PremiumRequestStatus.NEW.value,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ваша заявка уже на рассмотрении — мы свяжемся с вами",
        )

    request = MarketplacePremiumRequest(user_id=user.id, comment=body.comment)
    db.add(request)
    await db.flush()

    admins = (
        await db.execute(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
    ).all()
    for (admin_id,) in admins:
        await notification_service.notify(
            db=db,
            user_id=admin_id,
            event_type="premium_request_created",
            payload={"request_id": str(request.id), "blogger_name": user.name},
        )

    await db.commit()
    await db.refresh(request)
    return PremiumRequestResponse.model_validate(request)


@router.get("/requests/latest", response_model=PremiumRequestResponse)
async def get_latest_premium_request(
    user: Annotated[User, Depends(get_current_blogger)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PremiumRequestResponse:
    """Последняя заявка автора на премиум-размещение."""
    request = (
        await db.execute(
            select(MarketplacePremiumRequest)
            .where(MarketplacePremiumRequest.user_id == user.id)
            .order_by(MarketplacePremiumRequest.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заявок ещё не было",
        )
    return PremiumRequestResponse.model_validate(request)
