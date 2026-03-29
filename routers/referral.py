import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import limiter
from dependencies.auth import get_current_blogger, get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.referral import (
    ReferralBindRequest,
    ReferralCreate,
    ReferralLinkedResponse,
    ReferralRead,
)
from services.referral_service import (
    create_referral_for_blogger,
    get_referral_by_id,
    get_referral_by_username,
    is_valid_blogger_referral,
    set_worker_linked_to,
)

router = APIRouter(prefix="/referral", tags=["referral"])


@router.patch("/add", response_model=ReferralLinkedResponse)
@limiter.limit("30/minute")
async def bind_to_blogger_via_referral(
    request: Request,
    body: ReferralBindRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReferralLinkedResponse:
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Привязка по рефералке доступна только работникам",
        )
    if user.linked_to is not None:
        return ReferralLinkedResponse(
            linked=True,
            message="Привязка к блогеру уже есть",
            blogger_id=user.linked_to,
        )
    ref = await get_referral_by_id(body.referral_id, db)
    if ref is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реферальная ссылка не найдена",
        )
    if not await is_valid_blogger_referral(ref, db):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реферальная ссылка недействительна",
        )
    await set_worker_linked_to(user, ref.user_id, db)
    return ReferralLinkedResponse(
        linked=True,
        message="Привязка к блогеру выполнена",
        blogger_id=ref.user_id,
    )


@router.post("", response_model=ReferralRead, status_code=status.HTTP_201_CREATED)
async def create_referral(
    body: ReferralCreate,
    db: AsyncSession = Depends(get_db),
    blogger: User = Depends(get_current_blogger),
) -> ReferralRead:
    try:
        row = await create_referral_for_blogger(blogger, body.link, db)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Реферальная ссылка для этого блогера уже создана",
        ) from None
    return ReferralRead.model_validate(row)


@router.get("/{username}", response_model=ReferralRead)
async def get_referral(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> ReferralRead:
    row = await get_referral_by_username(username, db)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реферальная ссылка не найдена",
        )
    return ReferralRead.model_validate(row)
