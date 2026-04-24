import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import key_user_id_or_client_ip, limiter
from core.settings import settings
from dependencies.auth import get_current_user
from dependencies.database import get_db
from models.user import User
from schemas.deal import DealCreate, DealRead, DealStatusPatch
from services.deal_service import create_deal, deal_to_read, get_deal_for_user, patch_deal_status

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("", response_model=DealRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_deal_create, key_func=key_user_id_or_client_ip)
async def create_deal_endpoint(
    request: Request,
    body: DealCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DealRead:
    deal = await create_deal(user, body, db)
    return await deal_to_read(deal, user, db)


@router.patch("/{deal_id}", response_model=DealRead)
@limiter.limit(settings.rate_limit_deal_mutate, key_func=key_user_id_or_client_ip)
async def patch_deal_endpoint(
    request: Request,
    deal_id: uuid.UUID,
    body: DealStatusPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DealRead:
    deal = await patch_deal_status(deal_id, user, body.status, db)
    if deal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сделка не найдена",
        )
    return await deal_to_read(deal, user, db)


@router.get("/{deal_id}", response_model=DealRead)
@limiter.limit(settings.rate_limit_deal_read, key_func=key_user_id_or_client_ip)
async def get_deal_endpoint(
    request: Request,
    deal_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DealRead:
    deal = await get_deal_for_user(deal_id, user, db)
    if deal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сделка не найдена",
        )
    return await deal_to_read(deal, user, db)
