import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_admin
from dependencies.database import get_db
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.user import User
from schemas.admin import (
    AdminBloggerCreateRequest,
    AdminBloggerCreateResponse,
    AdminOverviewResponse,
    AdminUserLedgerResponse,
    AdminUserListResponse,
    AdminUserPatch,
    AdminUserRead,
    AdminUserStatsResponse,
)
from schemas.deal import (
    AdminDealAgreedPricePatch,
    AdminDealRecalcFinanceRequest,
    AdminDealStatusPatch,
    DealRead,
)
from schemas.finance import (
    FinancePreviewResponse,
    FinanceSchemeAdminListResponse,
    FinanceSchemeAdminPut,
    FinanceSchemeAdminRead,
)
from schemas.ledger import AdminLedgerStatusPatch, LedgerEntryRead, LedgerListResponse
from services.admin_overview_service import admin_get_overview
from services.admin_user_service import (
    admin_create_blogger,
    admin_delete_user,
    admin_get_user,
    admin_get_user_ledger,
    admin_get_user_stats,
    admin_list_users,
    admin_patch_user,
)
from services.deal_service import (
    admin_get_deal,
    admin_list_deals,
    admin_patch_deal_status,
    admin_recalc_deal_finance,
    admin_set_agreed_price,
    deal_to_read,
)
from services.finance_scheme_service import (
    admin_get_finance_scheme,
    admin_list_finance_schemes,
    admin_put_finance_scheme,
    distribute_price_kopeks,
    get_or_create_scheme_for_blogger,
)
from services.ledger_service import (
    admin_complete_payout,
    admin_get_ledger_entry,
    admin_list_ledger,
    admin_patch_ledger_status,
)
router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview", response_model=AdminOverviewResponse)
async def get_admin_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> AdminOverviewResponse:
    data = await admin_get_overview(db)
    return AdminOverviewResponse.model_validate(data)


@router.get("/users", response_model=AdminUserListResponse)
async def get_admin_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
    role: Annotated[UserRole | None, Query(description="Фильтр по роли")] = None,
    email: Annotated[str | None, Query(description="Поиск по email (contains)")] = None,
    linked_to: Annotated[uuid.UUID | None, Query(description="Фильтр по linked_to")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminUserListResponse:
    rows, total = await admin_list_users(
        db,
        role=role,
        email=email,
        linked_to=linked_to,
        limit=limit,
        offset=offset,
    )
    return AdminUserListResponse(items=[AdminUserRead.model_validate(u) for u in rows], total=total)


@router.post("/bloggers", response_model=AdminBloggerCreateResponse, status_code=status.HTTP_201_CREATED)
async def post_admin_blogger(
    body: AdminBloggerCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> AdminBloggerCreateResponse:
    user, password = await admin_create_blogger(body, db)
    return AdminBloggerCreateResponse(
        user=AdminUserRead.model_validate(user),
        nickname=user.nickname or "",
        generated_password=password,
    )


@router.get("/users/{user_id}", response_model=AdminUserRead)
async def get_admin_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> AdminUserRead:
    user = await admin_get_user(user_id, db)
    return AdminUserRead.model_validate(user)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def patch_admin_user(
    user_id: uuid.UUID,
    body: AdminUserPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin)],
) -> AdminUserRead:
    user = await admin_patch_user(user_id, body, admin, db)
    return AdminUserRead.model_validate(user)


@router.get("/users/{user_id}/stats", response_model=AdminUserStatsResponse)
async def get_admin_user_stats(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> AdminUserStatsResponse:
    return await admin_get_user_stats(user_id, db)


@router.get("/users/{user_id}/ledger", response_model=AdminUserLedgerResponse)
async def get_admin_user_ledger(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status_filter: Annotated[LedgerEntryStatus | None, Query(alias="status")] = None,
) -> AdminUserLedgerResponse:
    items, total = await admin_get_user_ledger(
        user_id,
        db,
        limit=limit,
        offset=offset,
        status_filter=status_filter,
    )
    return AdminUserLedgerResponse(
        items=[LedgerEntryRead.model_validate(row) for row in items],
        total=total,
    )


@router.get("/finance-schemes", response_model=FinanceSchemeAdminListResponse)
async def get_admin_finance_schemes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    email: Annotated[str | None, Query(description="Фильтр по email (contains)")] = None,
) -> FinanceSchemeAdminListResponse:
    items, total = await admin_list_finance_schemes(db, limit=limit, offset=offset, email_filter=email)
    return FinanceSchemeAdminListResponse(items=items, total=total)


@router.get("/finance-schemes/{blogger_id}", response_model=FinanceSchemeAdminRead)
async def get_admin_finance_scheme(
    blogger_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> FinanceSchemeAdminRead:
    return await admin_get_finance_scheme(blogger_id, db)


@router.put("/finance-schemes/{blogger_id}", response_model=FinanceSchemeAdminRead)
async def put_admin_finance_scheme(
    blogger_id: uuid.UUID,
    body: FinanceSchemeAdminPut,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> FinanceSchemeAdminRead:
    return await admin_put_finance_scheme(blogger_id, body, db)


@router.get("/finance/preview", response_model=FinancePreviewResponse)
async def get_admin_finance_preview(
    bloger_id: Annotated[uuid.UUID, Query(description="UUID блогера (схема распределения)")],
    price_kopeks: Annotated[int, Query(gt=0, description="Сумма для расчёта, копейки")],
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> FinancePreviewResponse:
    """Калькулятор долей по весам блогера (без сохранения)."""
    blogger = await db.get(User, bloger_id)
    if blogger is None or blogger.role != UserRole.BLOGER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Блогер не найден")
    scheme = await get_or_create_scheme_for_blogger(bloger_id, db)
    wk, bk, uk, pk = distribute_price_kopeks(price_kopeks, scheme)
    return FinancePreviewResponse(
        bloger_id=bloger_id,
        price_kopeks=price_kopeks,
        worker_kopeks=wk,
        bloger_kopeks=bk,
        upline_kopeks=uk,
        platform_kopeks=pk,
        weight_worker=scheme.weight_worker,
        weight_bloger=scheme.weight_bloger,
        weight_upline=scheme.weight_upline,
        weight_platform=scheme.weight_platform,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin)],
) -> Response:
    await admin_delete_user(user_id, admin, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/deals", response_model=list[DealRead])
async def get_admin_deals(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
    status: Annotated[DealStatus | None, Query(description="Фильтр по статусу")] = None,
    worker_id: Annotated[uuid.UUID | None, Query(description="Фильтр по worker_id")] = None,
    bloger_id: Annotated[uuid.UUID | None, Query(description="Фильтр по bloger_id")] = None,
    from_dt: Annotated[
        datetime | None,
        Query(alias="from", description="Дата/время начала интервала (inclusive, ISO8601)"),
    ] = None,
    to_dt: Annotated[
        datetime | None,
        Query(alias="to", description="Дата/время конца интервала (inclusive, ISO8601)"),
    ] = None,
) -> list[DealRead]:
    rows = await admin_list_deals(
        db,
        status_filter=status,
        worker_id=worker_id,
        bloger_id=bloger_id,
        created_from=from_dt,
        created_to=to_dt,
    )
    return [await deal_to_read(d, _admin, db) for d in rows]


@router.get("/deals/{deal_id}", response_model=DealRead)
async def get_admin_deal(
    deal_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> DealRead:
    deal = await admin_get_deal(deal_id, db)
    return await deal_to_read(deal, _admin, db)


@router.patch("/deals/{deal_id}/status", response_model=DealRead)
async def patch_admin_deal_status(
    deal_id: uuid.UUID,
    body: AdminDealStatusPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin)],
) -> DealRead:
    deal = await admin_patch_deal_status(deal_id, admin, body.status, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.patch("/deals/{deal_id}/agreed-price", response_model=DealRead)
async def patch_admin_deal_agreed_price(
    deal_id: uuid.UUID,
    body: AdminDealAgreedPricePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin)],
) -> DealRead:
    deal = await admin_set_agreed_price(
        deal_id,
        admin,
        body.agreed_price_kopeks,
        body.reason,
        db,
    )
    return await deal_to_read(deal, admin, db)


@router.post("/deals/{deal_id}/recalc-finance", response_model=DealRead)
async def post_admin_recalc_deal_finance(
    deal_id: uuid.UUID,
    body: AdminDealRecalcFinanceRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin)],
) -> DealRead:
    deal = await admin_recalc_deal_finance(deal_id, admin, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.get("/ledger", response_model=LedgerListResponse)
async def get_admin_ledger(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[LedgerEntryStatus | None, Query(description="Фильтр по статусу")] = None,
    user_id: Annotated[uuid.UUID | None, Query(description="Фильтр по пользователю")] = None,
    from_dt: Annotated[
        datetime | None,
        Query(alias="from", description="Дата/время начала интервала (inclusive, ISO8601)"),
    ] = None,
    to_dt: Annotated[
        datetime | None,
        Query(alias="to", description="Дата/время конца интервала (inclusive, ISO8601)"),
    ] = None,
) -> LedgerListResponse:
    items, total = await admin_list_ledger(
        db,
        limit=limit,
        offset=offset,
        status_filter=status,
        user_id=user_id,
        created_from=from_dt,
        created_to=to_dt,
    )
    return LedgerListResponse(
        items=[LedgerEntryRead.model_validate(row) for row in items],
        total=total,
    )


@router.get("/ledger/{entry_id}", response_model=LedgerEntryRead)
async def get_admin_ledger_entry(
    entry_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> LedgerEntryRead:
    entry = await admin_get_ledger_entry(entry_id, db)
    return LedgerEntryRead.model_validate(entry)


@router.patch("/ledger/{entry_id}", response_model=LedgerEntryRead)
async def patch_ledger_entry_status(
    entry_id: uuid.UUID,
    body: AdminLedgerStatusPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> LedgerEntryRead:
    entry = await admin_patch_ledger_status(entry_id, body.status, body.note, db)
    return LedgerEntryRead.model_validate(entry)


@router.post("/payouts/{entry_id}/complete", response_model=LedgerEntryRead)
async def post_admin_complete_payout(
    entry_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> LedgerEntryRead:
    entry = await admin_complete_payout(entry_id, db)
    return LedgerEntryRead.model_validate(entry)
