"""Admin Marketplace Router — управление маркетплейсом из админ-панели.

Endpoints:
- GET  /admin/marketplace/dashboard — сводная статистика
- GET  /admin/marketplace/orders — список заказов с фильтрами
- PATCH /admin/marketplace/orders/{id}/resolve — разрешение спора
- GET  /admin/marketplace/settings — текущие настройки комиссий
- PUT  /admin/marketplace/settings — обновление комиссий
- GET  /admin/marketplace/support/tickets — открытые тикеты
- PATCH /admin/marketplace/support/tickets/{id}/resolve — закрытие тикета
- PATCH /admin/marketplace/bloggers/{id} — редактирование профиля блогера
- GET  /admin/settlement-account — получить реквизиты р/с
- PUT  /admin/settlement-account — сохранить реквизиты р/с
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from dependencies.auth import get_current_admin_or_tech
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus, SupportTicketStatus
from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_order import MarketplaceOrder
from models.marketplace_settings import MarketplaceSettings
from models.order_status_history import OrderStatusHistory
from models.support_ticket import SupportTicket
from models.user import User
from schemas.marketplace import BloggerProfileResponse, BloggerProfileUpdateRequest
from schemas.marketplace_admin import (
    AdminMarketplaceSummaryResponse,
    AdminOrderDetailResponse,
    AdminOrderListResponse,
    AdminOrderResponse,
    CommissionSettingsRequest,
    CommissionSettingsResponse,
    DashboardResponse,
    DistributionBreakdown,
    EscrowLedgerEntry,
    OrderCountByStatus,
    OrderResolveRequest,
    StatusHistoryEntry,
)
from schemas.marketplace_orders import (
    CommissionSettingsReadResponse,
    CommissionSettingsUpdate,
    OrderResponse,
    RefundRequest,
)

from schemas.marketplace_support import TicketListResponse, TicketResponse
from schemas.settlement_account import SettlementAccountResponse, SettlementAccountUpsert
from services.marketplace_escrow_service import calculate_distribution, confirm_payment, distribute_funds, process_refund, refund_to_client
from services.settlement_account_service import (
    get_settlement_account,
    upsert_settlement_account,
)

router = APIRouter(prefix="/admin/marketplace", tags=["admin-marketplace"])

settlement_router = APIRouter(prefix="/admin", tags=["admin-settlement-account"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=DashboardResponse)
async def get_marketplace_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> DashboardResponse:
    """Сводка маркетплейса: общее кол-во заказов, выручка, активные блогеры, клиенты."""

    # Total orders
    total_orders_q = await db.execute(
        select(func.count()).select_from(MarketplaceOrder)
    )
    total_orders = total_orders_q.scalar_one()

    # Revenue: sum of amount_kopeks for orders in ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED
    revenue_statuses = [
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        MarketplaceOrderStatus.COMPLETED.value,
    ]
    revenue_q = await db.execute(
        select(func.coalesce(func.sum(MarketplaceOrder.amount_kopeks), 0)).where(
            MarketplaceOrder.status.in_(revenue_statuses)
        )
    )
    total_revenue_kopeks = revenue_q.scalar_one()

    # Active bloggers
    active_bloggers_q = await db.execute(
        select(func.count()).select_from(BloggerProfile).where(
            BloggerProfile.is_active.is_(True)
        )
    )
    active_bloggers_count = active_bloggers_q.scalar_one()

    # Registered clients
    clients_q = await db.execute(
        select(func.count()).select_from(User).where(User.role == UserRole.CLIENT)
    )
    registered_clients_count = clients_q.scalar_one()

    return DashboardResponse(
        total_orders=total_orders,
        total_revenue_kopeks=total_revenue_kopeks,
        active_bloggers_count=active_bloggers_count,
        registered_clients_count=registered_clients_count,
    )


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


@router.get("/orders", response_model=AdminOrderListResponse)
async def get_marketplace_orders(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
    status_filter: Annotated[
        MarketplaceOrderStatus | None,
        Query(alias="status", description="Фильтр по статусу заказа"),
    ] = None,
    from_dt: Annotated[
        datetime | None,
        Query(alias="from", description="Начало диапазона дат (inclusive, ISO8601)"),
    ] = None,
    to_dt: Annotated[
        datetime | None,
        Query(alias="to", description="Конец диапазона дат (inclusive, ISO8601)"),
    ] = None,
    blogger_id: Annotated[
        uuid.UUID | None,
        Query(description="Фильтр по ID блогера"),
    ] = None,
    client_id: Annotated[
        uuid.UUID | None,
        Query(description="Фильтр по ID клиента"),
    ] = None,
    worker_id: Annotated[
        uuid.UUID | None,
        Query(description="Фильтр по ID воркера"),
    ] = None,
) -> AdminOrderListResponse:
    """Список всех заказов маркетплейса с фильтрами и пагинацией.

    Включает имена участников (client_name, blogger_name, worker_name).
    Сортировка по дате создания (новые первыми).
    """

    offset = (page - 1) * page_size

    # Aliases for User table to join for names
    ClientUser = aliased(User, flat=True)
    BloggerUser = aliased(User, flat=True)
    WorkerUser = aliased(User, flat=True)

    # Base query with joins for names
    query = (
        select(
            MarketplaceOrder,
            ClientUser.name.label("client_name"),
            BloggerUser.name.label("blogger_name"),
            WorkerUser.name.label("worker_name"),
        )
        .join(ClientUser, MarketplaceOrder.client_id == ClientUser.id)
        .join(BloggerUser, MarketplaceOrder.blogger_id == BloggerUser.id)
        .outerjoin(WorkerUser, MarketplaceOrder.worker_id == WorkerUser.id)
    )

    # Count query (without joins, for efficiency)
    count_query = select(func.count()).select_from(MarketplaceOrder)

    # Apply filters
    if status_filter is not None:
        query = query.where(MarketplaceOrder.status == status_filter.value)
        count_query = count_query.where(MarketplaceOrder.status == status_filter.value)
    if from_dt is not None:
        query = query.where(MarketplaceOrder.created_at >= from_dt)
        count_query = count_query.where(MarketplaceOrder.created_at >= from_dt)
    if to_dt is not None:
        query = query.where(MarketplaceOrder.created_at <= to_dt)
        count_query = count_query.where(MarketplaceOrder.created_at <= to_dt)
    if blogger_id is not None:
        query = query.where(MarketplaceOrder.blogger_id == blogger_id)
        count_query = count_query.where(MarketplaceOrder.blogger_id == blogger_id)
    if client_id is not None:
        query = query.where(MarketplaceOrder.client_id == client_id)
        count_query = count_query.where(MarketplaceOrder.client_id == client_id)
    if worker_id is not None:
        query = query.where(MarketplaceOrder.worker_id == worker_id)
        count_query = count_query.where(MarketplaceOrder.worker_id == worker_id)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Get paginated results ordered by created_at descending
    query = query.order_by(MarketplaceOrder.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    # Build response items with names
    items = []
    for row in rows:
        order = row[0]
        items.append(
            AdminOrderResponse(
                id=order.id,
                client_id=order.client_id,
                blogger_id=order.blogger_id,
                worker_id=order.worker_id,
                amount_kopeks=order.amount_kopeks,
                status=order.status,
                created_at=order.created_at,
                updated_at=order.updated_at,
                client_name=row.client_name or "",
                blogger_name=row.blogger_name or "",
                worker_name=row.worker_name,
            )
        )

    return AdminOrderListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=AdminOrderDetailResponse)
async def get_marketplace_order_detail(
    order_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminOrderDetailResponse:
    """Полная информация о заказе для админ-панели.

    Включает:
    - Все поля заказа + имена участников
    - Историю смены статусов (OrderStatusHistory)
    - Записи эскроу-журнала (MarketplaceEscrowEntry)
    - Доли распределения (blogger_share, worker_share, platform_share)
    """

    # Aliases for participant names
    ClientUser = aliased(User, flat=True)
    BloggerUser = aliased(User, flat=True)
    WorkerUser = aliased(User, flat=True)

    result = await db.execute(
        select(
            MarketplaceOrder,
            ClientUser.name.label("client_name"),
            BloggerUser.name.label("blogger_name"),
            WorkerUser.name.label("worker_name"),
        )
        .join(ClientUser, MarketplaceOrder.client_id == ClientUser.id)
        .join(BloggerUser, MarketplaceOrder.blogger_id == BloggerUser.id)
        .outerjoin(WorkerUser, MarketplaceOrder.worker_id == WorkerUser.id)
        .where(MarketplaceOrder.id == order_id)
    )
    row = result.one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    order = row[0]

    # Fetch status history
    history_result = await db.execute(
        select(OrderStatusHistory)
        .where(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.created_at.asc())
    )
    history_rows = history_result.scalars().all()
    status_history = [
        StatusHistoryEntry(
            id=h.id,
            old_status=h.old_status,
            new_status=h.new_status,
            changed_by=h.changed_by,
            reason=h.reason,
            created_at=h.created_at,
        )
        for h in history_rows
    ]

    # Fetch escrow ledger entries
    ledger_result = await db.execute(
        select(MarketplaceEscrowEntry)
        .where(MarketplaceEscrowEntry.order_id == order_id)
        .order_by(MarketplaceEscrowEntry.created_at.asc())
    )
    ledger_rows = ledger_result.scalars().all()
    ledger_entries = [
        EscrowLedgerEntry(
            id=e.id,
            user_id=e.user_id,
            entry_type=e.entry_type,
            amount_kopeks=e.amount_kopeks,
            note=e.note,
            created_at=e.created_at,
        )
        for e in ledger_rows
    ]

    # Calculate distribution breakdown based on commission snapshot
    worker_pct = order.worker_commission_pct if order.worker_id else Decimal("0")
    blogger_share, worker_share, platform_share = calculate_distribution(
        amount_kopeks=order.amount_kopeks,
        platform_commission_pct=order.platform_commission_pct,
        worker_commission_pct=worker_pct,
    )
    distribution = DistributionBreakdown(
        blogger_share=blogger_share,
        worker_share=worker_share,
        platform_share=platform_share,
    )

    return AdminOrderDetailResponse(
        id=order.id,
        client_id=order.client_id,
        blogger_id=order.blogger_id,
        worker_id=order.worker_id,
        amount_kopeks=order.amount_kopeks,
        status=order.status,
        message=order.message,
        platform_commission_pct=order.platform_commission_pct,
        worker_commission_pct=order.worker_commission_pct,
        created_at=order.created_at,
        updated_at=order.updated_at,
        paid_at=order.paid_at,
        completed_at=order.completed_at,
        blogger_confirmed_at=order.blogger_confirmed_at,
        refunded_at=order.refunded_at,
        refund_reason=order.refund_reason,
        client_name=row.client_name or "",
        blogger_name=row.blogger_name or "",
        worker_name=row.worker_name,
        status_history=status_history,
        ledger_entries=ledger_entries,
        distribution=distribution,
    )


@router.get("/summary", response_model=AdminMarketplaceSummaryResponse)
async def get_marketplace_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> AdminMarketplaceSummaryResponse:
    """Сводка по заказам маркетплейса.

    Возвращает:
    - Общий оборот (сумма amount_kopeks для заказов в ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED)
    - Количество заказов по каждому статусу
    - Общая сумма комиссий воркерам (сумма release_worker из escrow ledger)
    """

    # Total turnover (orders in active/completed statuses)
    turnover_statuses = [
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        MarketplaceOrderStatus.COMPLETED.value,
    ]
    turnover_result = await db.execute(
        select(func.coalesce(func.sum(MarketplaceOrder.amount_kopeks), 0)).where(
            MarketplaceOrder.status.in_(turnover_statuses)
        )
    )
    total_turnover_kopeks = turnover_result.scalar_one()

    # Count by status
    count_result = await db.execute(
        select(
            MarketplaceOrder.status,
            func.count().label("cnt"),
        )
        .group_by(MarketplaceOrder.status)
    )
    count_rows = count_result.all()
    orders_by_status = [
        OrderCountByStatus(status=row.status, count=row.cnt)
        for row in count_rows
    ]

    # Total worker commissions (sum of release_worker entries)
    worker_commissions_result = await db.execute(
        select(func.coalesce(func.sum(MarketplaceEscrowEntry.amount_kopeks), 0)).where(
            MarketplaceEscrowEntry.entry_type == "release_worker"
        )
    )
    total_worker_commissions_kopeks = worker_commissions_result.scalar_one()

    return AdminMarketplaceSummaryResponse(
        total_turnover_kopeks=total_turnover_kopeks,
        orders_by_status=orders_by_status,
        total_worker_commissions_kopeks=total_worker_commissions_kopeks,
    )


@router.patch("/orders/{order_id}/confirm-payment", response_model=OrderResponse)
async def confirm_order_payment(
    order_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> OrderResponse:
    """Подтвердить получение оплаты по заказу.

    Переводит заказ из PENDING_PAYMENT в ESCROW_HELD,
    замораживает средства на платформе. Только для Admin.
    """
    order = await confirm_payment(order_id=order_id, admin_id=admin.id, db=db)
    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/orders/{order_id}/refund", response_model=OrderResponse)
async def refund_order(
    order_id: uuid.UUID,
    body: RefundRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> OrderResponse:
    """Оформить возврат средств по заказу.

    Допускается для заказов в статусах ESCROW_HELD и BLOGGER_CONFIRMED.
    Переводит заказ в статус REFUNDED. Балансы участников не меняются.
    Только для Admin.
    """
    order = await process_refund(
        order_id=order_id,
        admin_id=admin.id,
        reason=body.reason,
        db=db,
    )
    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/orders/{order_id}/resolve", response_model=OrderResponse)
async def resolve_marketplace_order(
    order_id: uuid.UUID,
    body: OrderResolveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> OrderResponse:
    """Разрешение спора по заказу.

    - favor_client → возврат средств клиенту, статус REFUNDED
    - favor_blogger → распределение средств, статус COMPLETED

    Допускается только для заказов в статусе ESCROW_HELD.
    """

    # Fetch order with lock
    result = await db.execute(
        select(MarketplaceOrder)
        .where(MarketplaceOrder.id == order_id)
        .with_for_update()
    )
    order = result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    if order.status != MarketplaceOrderStatus.ESCROW_HELD.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ручное изменение статуса допускается только для заказов в статусе ESCROW_HELD",
        )

    if body.decision == "favor_client":
        await refund_to_client(order_id, db)
        order.status = MarketplaceOrderStatus.REFUNDED.value
    else:  # favor_blogger
        await distribute_funds(order_id, db)
        order.status = MarketplaceOrderStatus.COMPLETED.value
        order.completed_at = func.now()

    await db.flush()
    await db.commit()
    await db.refresh(order)

    return OrderResponse.model_validate(order)


# ---------------------------------------------------------------------------
# Commission Settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=CommissionSettingsResponse)
async def get_marketplace_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> CommissionSettingsResponse:
    """Получить текущие настройки комиссий маркетплейса."""

    settings = await _get_or_create_settings(db)
    return CommissionSettingsResponse(
        platform_commission_pct=settings.platform_commission_pct,
        worker_referral_commission_pct=settings.worker_referral_commission_pct,
    )


@router.put("/settings", response_model=CommissionSettingsResponse)
async def update_marketplace_settings(
    body: CommissionSettingsRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> CommissionSettingsResponse:
    """Обновить настройки комиссий маркетплейса.

    - platform_commission_pct: 1-50%, макс. 2 знака после запятой
    - worker_referral_commission_pct: 1-30%, макс. 2 знака после запятой
    """

    settings = await _get_or_create_settings(db)
    settings.platform_commission_pct = body.platform_commission_pct
    settings.worker_referral_commission_pct = body.worker_referral_commission_pct
    settings.updated_by = admin.id

    await db.flush()
    await db.commit()
    await db.refresh(settings)

    return CommissionSettingsResponse(
        platform_commission_pct=settings.platform_commission_pct,
        worker_referral_commission_pct=settings.worker_referral_commission_pct,
    )


# ---------------------------------------------------------------------------
# Commission Settings (new /commission-settings endpoints)
# ---------------------------------------------------------------------------


@router.get("/commission-settings", response_model=CommissionSettingsReadResponse)
async def get_commission_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> CommissionSettingsReadResponse:
    """Получить текущие значения комиссий платформы и воркера.

    Возвращает platform_commission_pct и worker_commission_pct с точностью
    до 2 знаков после запятой.
    """

    settings = await _get_or_create_settings(db)
    return CommissionSettingsReadResponse(
        platform_commission_pct=settings.platform_commission_pct,
        worker_commission_pct=settings.worker_referral_commission_pct,
    )


@router.put("/commission-settings", response_model=CommissionSettingsReadResponse)
async def update_commission_settings(
    body: CommissionSettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> CommissionSettingsReadResponse:
    """Обновить настройки комиссий платформы и воркера.

    Валидация:
    - platform_commission_pct: 1–50%, макс. 2 знака после запятой
    - worker_commission_pct: 1–30%, макс. 2 знака после запятой
    - Сумма комиссий не более 80%
    """

    settings = await _get_or_create_settings(db)
    settings.platform_commission_pct = body.platform_commission_pct
    settings.worker_referral_commission_pct = body.worker_commission_pct
    settings.updated_by = admin.id

    await db.flush()
    await db.commit()
    await db.refresh(settings)

    return CommissionSettingsReadResponse(
        platform_commission_pct=settings.platform_commission_pct,
        worker_commission_pct=settings.worker_referral_commission_pct,
    )


# ---------------------------------------------------------------------------
# Support Tickets
# ---------------------------------------------------------------------------


@router.get("/support/tickets", response_model=TicketListResponse)
async def get_marketplace_support_tickets(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
    page: Annotated[int, Query(ge=1)] = 1,
) -> TicketListResponse:
    """Список открытых тикетов поддержки маркетплейса."""

    page_size = 50
    offset = (page - 1) * page_size

    # Count open tickets
    count_result = await db.execute(
        select(func.count())
        .select_from(SupportTicket)
        .where(SupportTicket.status == SupportTicketStatus.OPEN.value)
    )
    total = count_result.scalar_one()

    # Get paginated open tickets
    result = await db.execute(
        select(SupportTicket)
        .where(SupportTicket.status == SupportTicketStatus.OPEN.value)
        .order_by(SupportTicket.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    tickets = result.scalars().all()

    return TicketListResponse(
        items=[TicketResponse.model_validate(t) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/support/tickets/{ticket_id}/resolve", response_model=TicketResponse)
async def resolve_marketplace_support_ticket(
    ticket_id: uuid.UUID,
    body: OrderResolveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> TicketResponse:
    """Разрешить тикет поддержки с решением и причиной.

    Также выполняет действие по заказу:
    - favor_client → возврат средств, статус заказа REFUNDED
    - favor_blogger → распределение средств, статус заказа COMPLETED
    """

    # Fetch ticket
    result = await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()

    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Тикет не найден",
        )

    if ticket.status == SupportTicketStatus.RESOLVED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Тикет уже разрешён",
        )

    # Fetch the associated order with lock
    order_result = await db.execute(
        select(MarketplaceOrder)
        .where(MarketplaceOrder.id == ticket.order_id)
        .with_for_update()
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Связанный заказ не найден",
        )

    # Only allow resolution for orders in ESCROW_HELD or BLOGGER_CONFIRMED
    allowed_statuses = [
        MarketplaceOrderStatus.ESCROW_HELD.value,
        MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
    ]
    if order.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Разрешение спора допускается только для заказов в статусе ESCROW_HELD или BLOGGER_CONFIRMED",
        )

    # Execute the resolution action on the order
    if body.decision == "favor_client":
        await refund_to_client(order.id, db)
        order.status = MarketplaceOrderStatus.REFUNDED.value
    else:  # favor_blogger
        await distribute_funds(order.id, db)
        order.status = MarketplaceOrderStatus.COMPLETED.value
        order.completed_at = func.now()

    # Close the ticket
    ticket.status = SupportTicketStatus.RESOLVED.value
    ticket.resolved_by = admin.id
    ticket.resolution_decision = body.decision
    ticket.resolution_reason = body.reason
    ticket.resolved_at = func.now()

    await db.flush()
    await db.commit()
    await db.refresh(ticket)

    return TicketResponse.model_validate(ticket)


# ---------------------------------------------------------------------------
# Blogger Profile Management
# ---------------------------------------------------------------------------


@router.patch("/bloggers/{blogger_profile_id}", response_model=BloggerProfileResponse)
async def patch_marketplace_blogger(
    blogger_profile_id: uuid.UUID,
    body: BloggerProfileUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> BloggerProfileResponse:
    """Редактирование профиля блогера администратором (категория, цена, статус)."""

    result = await db.execute(
        select(BloggerProfile).where(BloggerProfile.id == blogger_profile_id)
    )
    profile = result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль блогера не найден",
        )

    # Apply partial update — only set fields that were explicitly provided
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.flush()
    await db.commit()
    await db.refresh(profile)

    # Get the user name for the response
    user = await db.get(User, profile.user_id)
    user_name = user.name if user else ""

    return BloggerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        name=user_name,
        category=profile.category,
        gender=profile.gender if profile.gender in {"female", "male", "other"} else None,
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_create_settings(db: AsyncSession) -> MarketplaceSettings:
    """Получить singleton-запись настроек маркетплейса, создать если не существует."""
    result = await db.execute(
        select(MarketplaceSettings).where(MarketplaceSettings.id == 1)
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = MarketplaceSettings(id=1)
        db.add(settings)
        await db.flush()
    return settings


# ---------------------------------------------------------------------------
# Settlement Account (Расчётный счёт)
# ---------------------------------------------------------------------------


@settlement_router.get("/settlement-account", response_model=SettlementAccountResponse)
async def get_settlement_account_endpoint(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> SettlementAccountResponse:
    """Получить текущие реквизиты расчётного счёта.

    Возвращает 404, если реквизиты ещё не настроены.
    """
    account = await get_settlement_account(db)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Реквизиты расчётного счёта не настроены",
        )
    return SettlementAccountResponse.model_validate(account)


@settlement_router.put("/settlement-account", response_model=SettlementAccountResponse)
async def put_settlement_account_endpoint(
    body: SettlementAccountUpsert,
    db: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(get_current_admin_or_tech)],
) -> SettlementAccountResponse:
    """Создать или обновить реквизиты расчётного счёта.

    Валидирует формат полей:
    - account_number: ровно 20 цифр
    - bic: ровно 9 цифр
    - bank_name: 1–255 символов
    - recipient_name: 1–255 символов
    """
    account = await upsert_settlement_account(db, body, admin.id)
    await db.commit()
    await db.refresh(account)
    return SettlementAccountResponse.model_validate(account)
