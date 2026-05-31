import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.user import User
from schemas.admin import (
    AdminAuditEntryRead,
    AdminAuditListResponse,
    AdminBalanceAdjustmentRequest,
    AdminBalanceAdjustmentResponse,
    AdminBloggerCreateRequest,
    AdminBloggerCreateResponse,
    AdminOverviewResponse,
    AdminPartnerCardSet,
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
    AdminEscrowActionRequest,
    DealRead,
)
from schemas.payment_details import (
    AdminPaymentDetailsRead,
    AdminPaymentDetailsSet,
)
from schemas.finance import (
    FinancePreviewResponse,
    FinanceSchemeAdminListResponse,
    FinanceSchemeAdminPut,
    FinanceSchemeAdminRead,
    PlatformFinanceDashboard,
    ReportingPeriod,
)
from schemas.ledger import AdminLedgerStatusPatch, LedgerEntryRead, LedgerListResponse
from services.admin_audit_service import list_admin_audit
from services.admin_overview_service import admin_get_overview
from services.admin_payment_details_service import (
    get_admin_payment_details_masked,
    set_admin_payment_details,
)
from services.admin_user_service import (
    admin_adjust_user_balance,
    admin_create_blogger,
    admin_delete_user,
    admin_get_user,
    admin_get_user_ledger,
    admin_get_user_stats,
    admin_list_users,
    admin_patch_user,
    admin_set_partner_card,
)
from services.deal_service import (
    admin_confirm_receipt,
    admin_distribute_escrow,
    admin_get_deal,
    admin_list_deals,
    admin_patch_deal_status,
    admin_recalc_deal_finance,
    admin_refund_escrow,
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
from services.finance_stats_service import get_platform_finance_dashboard
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminOverviewResponse:
    data = await admin_get_overview(db)
    return AdminOverviewResponse.model_validate(data)


@router.get("/users", response_model=AdminUserListResponse)
async def get_admin_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminUserRead:
    user = await admin_get_user(user_id, db)
    return AdminUserRead.model_validate(user)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def patch_admin_user(
    user_id: uuid.UUID,
    body: AdminUserPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminUserRead:
    user = await admin_patch_user(user_id, body, admin, db)
    return AdminUserRead.model_validate(user)


@router.post("/users/{user_id}/balance-adjustment", response_model=AdminBalanceAdjustmentResponse)
async def post_admin_user_balance_adjustment(
    user_id: uuid.UUID,
    body: AdminBalanceAdjustmentRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminBalanceAdjustmentResponse:
    user, entry = await admin_adjust_user_balance(
        user_id,
        body.amount_kopeks,
        body.reason,
        actor=admin,
        db=db,
    )
    return AdminBalanceAdjustmentResponse(
        user=AdminUserRead.model_validate(user),
        ledger_entry=LedgerEntryRead.model_validate(entry),
    )


@router.post("/users/{user_id}/payout-card", response_model=AdminUserRead)
async def post_admin_user_payout_card(
    user_id: uuid.UUID,
    body: AdminPartnerCardSet,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminUserRead:
    user = await admin_set_partner_card(
        user_id, body.card_number, body.card_brand, body.card_holder, actor=admin, db=db
    )
    return AdminUserRead.model_validate(user)


@router.get("/users/{user_id}/audit", response_model=AdminAuditListResponse)
async def get_admin_user_audit(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AdminAuditListResponse:
    rows, total = await list_admin_audit(db, user_id, limit=limit, offset=offset)
    return AdminAuditListResponse(
        items=[AdminAuditEntryRead.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/users/{user_id}/stats", response_model=AdminUserStatsResponse)
async def get_admin_user_stats(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminUserStatsResponse:
    return await admin_get_user_stats(user_id, db)


@router.get("/users/{user_id}/ledger", response_model=AdminUserLedgerResponse)
async def get_admin_user_ledger(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> FinanceSchemeAdminRead:
    return await admin_get_finance_scheme(blogger_id, db)


@router.put("/finance-schemes/{blogger_id}", response_model=FinanceSchemeAdminRead)
async def put_admin_finance_scheme(
    blogger_id: uuid.UUID,
    body: FinanceSchemeAdminPut,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> FinanceSchemeAdminRead:
    return await admin_put_finance_scheme(blogger_id, body, db)


@router.get("/finance/preview", response_model=FinancePreviewResponse)
async def get_admin_finance_preview(
    bloger_id: Annotated[uuid.UUID, Query(description="UUID блогера (схема распределения)")],
    price_kopeks: Annotated[int, Query(gt=0, description="Сумма для расчёта, копейки")],
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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


@router.get("/finance/dashboard", response_model=PlatformFinanceDashboard)
async def get_admin_finance_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    period: Annotated[
        ReportingPeriod,
        Query(description="Период агрегации: today/week/month/all (по умолчанию all)"),
    ] = ReportingPeriod.ALL,
) -> PlatformFinanceDashboard:
    """Финансовый дашборд платформы; все денежные значения — копейки.

    Доступ: Admin или Tech_Admin (иначе 403, Req 8.1/8.2). Невалидный `period` →
    422 на уровне FastAPI (Req 8.23); отсутствие `period` ≡ `all` (Req 8.22).
    Отсутствие системного счёта платформы → ошибка конфигурации без частичных
    данных (Req 8.3).
    """
    return await get_platform_finance_dashboard(db, period)


@router.get("/payment-details", response_model=AdminPaymentDetailsRead)
async def get_admin_payment_details(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminPaymentDetailsRead:
    """Текущие реквизиты приёма платежей в маскированном виде (Req 1.3).

    Доступ: Admin или Tech_Admin (иначе 403, Req 1.5). Возвращает Платёжную_Ссылку
    и последние 4 цифры Карты_Приёма без раскрытия полного PAN.
    """
    return await get_admin_payment_details_masked(db)


@router.put("/payment-details", response_model=AdminPaymentDetailsRead)
async def put_admin_payment_details(
    body: AdminPaymentDetailsSet,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminPaymentDetailsRead:
    """Сохранить/заменить реквизиты приёма платежей (Req 1.1, 1.2, 1.4, 2.x).

    Доступ: Admin или Tech_Admin (иначе 403, Req 1.5). Семантика «не передано vs
    очистить» сохраняется передачей в сервис только тех реквизитов, что реально
    присутствуют в теле запроса (``model_fields_set``); отсутствующие поля
    остаются прежними (сентинел ``_UNSET`` на стороне сервиса).
    """
    kwargs: dict[str, str | None] = {}
    if "collection_card" in body.model_fields_set:
        kwargs["collection_card"] = body.collection_card
    if "payment_link" in body.model_fields_set:
        kwargs["payment_link"] = body.payment_link
    return await set_admin_payment_details(admin, db=db, **kwargs)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> Response:
    await admin_delete_user(user_id, admin, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/deals", response_model=list[DealRead])
async def get_admin_deals(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    deal = await admin_get_deal(deal_id, db)
    return await deal_to_read(deal, _admin, db)


@router.patch("/deals/{deal_id}/status", response_model=DealRead)
async def patch_admin_deal_status(
    deal_id: uuid.UUID,
    body: AdminDealStatusPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    deal = await admin_patch_deal_status(deal_id, admin, body.status, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.patch("/deals/{deal_id}/agreed-price", response_model=DealRead)
async def patch_admin_deal_agreed_price(
    deal_id: uuid.UUID,
    body: AdminDealAgreedPricePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    deal = await admin_recalc_deal_finance(deal_id, admin, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.post("/deals/{deal_id}/confirm-receipt", response_model=DealRead)
async def post_admin_deal_confirm_receipt(
    deal_id: uuid.UUID,
    body: AdminEscrowActionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    """Подтверждение_Получения средств Плательщика (CONFIRMED → ESCROW_HELD).

    Доступ: Admin или Tech_Admin (иначе 403, Req 4.5/8.4/8.5).
    """
    deal = await admin_confirm_receipt(deal_id, admin, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.post("/deals/{deal_id}/distribute", response_model=DealRead)
async def post_admin_deal_distribute(
    deal_id: uuid.UUID,
    body: AdminEscrowActionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    """Распределение удерживаемых средств участникам (ESCROW_HELD → PAID).

    Доступ: Admin или Tech_Admin (иначе 403, Req 8.4/8.5).
    """
    deal = await admin_distribute_escrow(deal_id, admin, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.post("/deals/{deal_id}/refund", response_model=DealRead)
async def post_admin_deal_refund(
    deal_id: uuid.UUID,
    body: AdminEscrowActionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DealRead:
    """Возврат собранных, но не распределённых средств (ESCROW_HELD → REFUNDED).

    Доступ: Admin или Tech_Admin (иначе 403, Req 7.5/8.4/8.5).
    """
    deal = await admin_refund_escrow(deal_id, admin, body.reason, db)
    return await deal_to_read(deal, admin, db)


@router.get("/ledger", response_model=LedgerListResponse)
async def get_admin_ledger(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
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
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> LedgerEntryRead:
    entry = await admin_get_ledger_entry(entry_id, db)
    return LedgerEntryRead.model_validate(entry)


@router.patch("/ledger/{entry_id}", response_model=LedgerEntryRead)
async def patch_ledger_entry_status(
    entry_id: uuid.UUID,
    body: AdminLedgerStatusPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> LedgerEntryRead:
    entry = await admin_patch_ledger_status(entry_id, body.status, body.note, db)
    return LedgerEntryRead.model_validate(entry)


@router.post("/payouts/{entry_id}/complete", response_model=LedgerEntryRead)
async def post_admin_complete_payout(
    entry_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> LedgerEntryRead:
    entry = await admin_complete_payout(entry_id, db)
    return LedgerEntryRead.model_validate(entry)
