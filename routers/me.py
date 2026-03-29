from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import key_user_id_or_client_ip, limiter
from core.settings import settings
from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.user import User
from schemas.ledger import LedgerEntryRead, LedgerListResponse, PayoutRequestCreate
from schemas.me import (
    BloggerMeStatsRead,
    MeDealsResponse,
    MeStatsResponse,
    UserMePatch,
    UserMeRead,
    WorkerMeStatsRead,
)
from schemas.deal import DealRead
from services.deal_service import list_deals_for_user
from services.ledger_service import create_payout_request, list_ledger_for_user
from services.me_service import (
    apply_me_patch,
    get_or_create_blogger_stat,
    get_or_create_worker_stat,
    user_to_me_read,
)

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserMeRead)
async def get_me(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserMeRead:
    return await user_to_me_read(user, db)


@router.patch("", response_model=UserMeRead)
async def patch_me(
    body: UserMePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserMeRead:
    await apply_me_patch(user, body, db)
    await db.refresh(user)
    return await user_to_me_read(user, db)


@router.get("/deals", response_model=MeDealsResponse)
@limiter.limit(settings.rate_limit_deal_read, key_func=key_user_id_or_client_ip)
async def get_my_deals(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MeDealsResponse:
    rows = await list_deals_for_user(user, db)
    return MeDealsResponse(deals=[DealRead.model_validate(d) for d in rows])


@router.get("/ledger", response_model=LedgerListResponse)
async def get_my_ledger(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[LedgerEntryStatus | None, Query(description="Фильтр по статусу")] = None,
) -> LedgerListResponse:
    items, total = await list_ledger_for_user(
        user.id,
        db,
        limit=limit,
        offset=offset,
        status_filter=status,
    )
    return LedgerListResponse(
        items=[LedgerEntryRead.model_validate(row) for row in items],
        total=total,
    )


@router.post("/payout-requests", response_model=LedgerEntryRead)
async def post_payout_request(
    body: PayoutRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> LedgerEntryRead:
    entry = await create_payout_request(user, body, db)
    return LedgerEntryRead.model_validate(entry)


@router.get("/stats", response_model=MeStatsResponse)
async def get_me_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> WorkerMeStatsRead | BloggerMeStatsRead:
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Статистика кабинета для этой роли не предусмотрена",
        )
    if user.role == UserRole.WORKER:
        row = await get_or_create_worker_stat(user.id, db)
        return WorkerMeStatsRead.model_validate(row)
    if user.role == UserRole.BLOGER:
        row = await get_or_create_blogger_stat(user.id, db)
        return BloggerMeStatsRead.model_validate(row)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Неизвестная роль",
    )
