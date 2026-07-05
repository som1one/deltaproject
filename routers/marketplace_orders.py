"""Роутер заказов маркетплейса блогеров.

Обеспечивает создание заказов, просмотр списка/деталей,
а также переходы статусов (complete, confirm) с атомарными проверками.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus
from enums.user import UserRole
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.marketplace_settings import MarketplaceSettings
from models.user import User
from schemas.marketplace_orders import (
    OrderCreateRequest,
    OrderDetailResponse,
    OrderListResponse,
    OrderResponse,
)
from schemas.settlement_account import SettlementAccountResponse
from services import (
    marketplace_escrow_service,
    marketplace_payment_settings_service,
    notification_service,
    settlement_account_service,
)
from services.marketplace_referral_service import get_worker_id_for_order
from services.order_state_machine import transition_order

router = APIRouter(prefix="/marketplace/orders", tags=["marketplace-orders"])


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Создать заказ на маркетплейсе (только для роли Client).

    Валидирует сообщение (1-1000 символов), проверяет что блогер активен
    и принимает заказы, снимает снапшот комиссий на момент создания.
    """
    # Only clients can create orders
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут создавать заказы",
        )

    # Find blogger profile and validate availability
    profile_result = await db.execute(
        select(BloggerProfile).where(BloggerProfile.user_id == body.blogger_id)
    )
    profile = profile_result.scalar_one_or_none()

    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль блогера не найден",
        )

    if not profile.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Блогер неактивен",
        )

    if not profile.orders_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Блогер не принимает заказы",
        )

    # Snapshot commission settings
    settings_result = await db.execute(
        select(MarketplaceSettings).where(MarketplaceSettings.id == 1)
    )
    settings = settings_result.scalar_one_or_none()

    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Настройки маркетплейса не найдены",
        )

    platform_commission_pct = settings.platform_commission_pct
    # Worker commission only if client was referred by a worker (Requirement 6.2, 6.4)
    worker_id = get_worker_id_for_order(user)
    worker_commission_pct = (
        settings.worker_referral_commission_pct
        if worker_id is not None
        else Decimal("0.00")
    )

    # Create order
    order = MarketplaceOrder(
        client_id=user.id,
        blogger_id=body.blogger_id,
        worker_id=worker_id,
        status=MarketplaceOrderStatus.PENDING_PAYMENT.value,
        amount_kopeks=body.amount_kopeks,
        message=body.message,
        platform_commission_pct=platform_commission_pct,
        worker_commission_pct=worker_commission_pct,
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)
    await db.commit()

    return OrderResponse.model_validate(order)


@router.get("", response_model=OrderListResponse)
async def list_orders(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=20, ge=1, le=50, description="Размер страницы"),
) -> OrderListResponse:
    """Список заказов текущего пользователя.

    Client видит свои заказы, Blogger видит назначенные ему заказы.
    """
    if user.role == UserRole.CLIENT:
        filter_condition = MarketplaceOrder.client_id == user.id
    elif user.role == UserRole.BLOGER:
        filter_condition = MarketplaceOrder.blogger_id == user.id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только клиентам и блогерам",
        )

    # Count total
    count_query = select(func.count()).select_from(
        select(MarketplaceOrder).where(filter_condition).subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Fetch paginated results
    offset = (page - 1) * page_size
    items_query = (
        select(MarketplaceOrder)
        .where(filter_condition)
        .order_by(MarketplaceOrder.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(items_query)
    orders = result.scalars().all()

    # Имена сторон одним запросом
    user_ids = {o.client_id for o in orders} | {o.blogger_id for o in orders}
    names: dict[uuid.UUID, str] = {}
    if user_ids:
        names_result = await db.execute(
            select(User.id, User.name).where(User.id.in_(user_ids))
        )
        names = {row.id: row.name for row in names_result.all()}

    items: list[OrderResponse] = []
    for o in orders:
        item = OrderResponse.model_validate(o)
        item.blogger_name = names.get(o.blogger_id)
        item.client_name = names.get(o.client_id)
        items.append(item)

    return OrderListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{order_id}", response_model=OrderDetailResponse)
async def get_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderDetailResponse:
    """Детали заказа с проверкой доступа.

    Доступно клиенту-владельцу заказа, назначенному блогеру или Admin.
    Возвращает settlement_account (только для PENDING_PAYMENT) и available_actions.
    """
    order_result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Auth check: order client, assigned blogger, or Admin (Requirement 2.4)
    is_admin = user.role == UserRole.ADMIN
    is_client = user.id == order.client_id
    is_blogger = user.id == order.blogger_id

    if not (is_client or is_blogger or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому заказу",
        )

    # Build payment requisites: only for PENDING_PAYMENT and only for client or Admin (Req 2.1, 2.3)
    sa_response: SettlementAccountResponse | None = None
    card_requisites = None
    yookassa_available = False
    if order.status == MarketplaceOrderStatus.PENDING_PAYMENT.value and (is_client or is_admin):
        account = await settlement_account_service.get_settlement_account(db)
        if account is not None:
            sa_response = SettlementAccountResponse.model_validate(account)
        payment_settings = await marketplace_payment_settings_service.get_payment_settings(db)
        card_requisites = marketplace_payment_settings_service.to_card_requisites(payment_settings)
        creds = await marketplace_payment_settings_service.get_effective_yookassa(db)
        yookassa_available = creds.active

    # Имена сторон для карточки заказа
    names_result = await db.execute(
        select(User.id, User.name).where(User.id.in_([order.client_id, order.blogger_id]))
    )
    names = {row.id: row.name for row in names_result.all()}

    # Build available_actions based on role and status (Req 2.1, 2.2, 2.3, 2.4)
    available_actions: list[str] = []
    order_status = order.status

    if is_admin:
        if order_status == MarketplaceOrderStatus.PENDING_PAYMENT.value:
            available_actions.append("confirm_payment")
        if order_status in (
            MarketplaceOrderStatus.ESCROW_HELD.value,
            MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        ):
            available_actions.append("refund")

    if is_blogger and order.blogger_id == user.id:
        if order_status == MarketplaceOrderStatus.ESCROW_HELD.value:
            available_actions.append("complete")

    if is_client and order.client_id == user.id:
        if order_status == MarketplaceOrderStatus.BLOGGER_CONFIRMED.value:
            available_actions.append("confirm")
        if order_status == MarketplaceOrderStatus.PENDING_PAYMENT.value:
            available_actions.append("cancel")
            if order.payment_reported_at is None:
                available_actions.append("mark_paid")

    # Construct response
    response = OrderDetailResponse.model_validate(order)
    response.settlement_account = sa_response
    response.card_requisites = card_requisites
    response.yookassa_available = yookassa_available
    response.blogger_name = names.get(order.blogger_id)
    response.client_name = names.get(order.client_id)
    response.available_actions = available_actions

    return response


@router.patch("/{order_id}/mark-paid", response_model=OrderResponse)
async def mark_order_paid(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Клиент сообщает, что перевёл оплату по реквизитам.

    Статус не меняется (остаётся PENDING_PAYMENT) — устанавливается
    payment_reported_at и уведомляются администраторы, которые должны
    проверить поступление и подтвердить оплату вручную.
    """
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут сообщать об оплате",
        )

    order_result = await db.execute(
        select(MarketplaceOrder)
        .where(MarketplaceOrder.id == order_id)
        .with_for_update()
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сообщить об оплате можно только для заказа, ожидающего оплату",
        )

    if order.payment_reported_at is None:
        order.payment_reported_at = datetime.now(timezone.utc)

        # Уведомляем администраторов о необходимости проверить поступление
        admins_result = await db.execute(
            select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        for (admin_id,) in admins_result.all():
            await notification_service.notify(
                db=db,
                user_id=admin_id,
                event_type="order_payment_reported",
                payload={
                    "order_id": str(order.id),
                    "amount": order.amount_kopeks,
                    "client_name": user.name,
                },
            )

        await db.commit()
        await db.refresh(order)

    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/complete", response_model=OrderResponse)
async def complete_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Блогер отмечает заказ выполненным.

    Переход: ESCROW_HELD → BLOGGER_CONFIRMED.
    Только назначенный блогер может выполнить это действие.
    Устанавливает blogger_confirmed_at и уведомляет заказчика.
    """
    # Verify user is a blogger
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только блогеры могут отмечать заказы выполненными",
        )

    # Fetch order
    order_result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Check that the user is the assigned blogger (Requirement 4.3)
    if order.blogger_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь исполнителем этого заказа",
        )

    # Transition via state machine (validates ESCROW_HELD → BLOGGER_CONFIRMED)
    order = await transition_order(
        db, order, MarketplaceOrderStatus.BLOGGER_CONFIRMED, user.id
    )

    # Set blogger_confirmed_at timestamp
    order.blogger_confirmed_at = datetime.now(timezone.utc)

    # Notify the client that blogger confirmed completion (Requirement 14.2)
    await notification_service.notify(
        db=db,
        user_id=order.client_id,
        event_type="blogger_confirmed",
        payload={
            "order_id": str(order.id),
            "blogger_name": user.name,
        },
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/confirm", response_model=OrderResponse)
async def confirm_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Клиент подтверждает получение услуги.

    Переход: BLOGGER_CONFIRMED → COMPLETED.
    Только клиент-владелец заказа может выполнить это действие.
    После подтверждения:
    - Устанавливается completed_at
    - Вызывается distribute_funds для распределения средств
    - Отправляются уведомления блогеру и воркеру (если привязан)
    """
    # Verify user is a client (Requirement 4.6)
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут подтверждать получение",
        )

    # Fetch order
    order_result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Check ownership: only the client who created the order (Requirement 4.6)
    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    # Transition via state machine (validates BLOGGER_CONFIRMED → COMPLETED)
    order = await transition_order(
        db, order, MarketplaceOrderStatus.COMPLETED, user.id
    )

    # Set completed_at timestamp
    order.completed_at = datetime.now(timezone.utc)

    # Distribute funds (Requirement 4.7)
    await marketplace_escrow_service.distribute_funds(
        order_id=order.id,
        db=db,
    )

    # Notify blogger about order completion (Requirement 14.3)
    await notification_service.notify(
        db=db,
        user_id=order.blogger_id,
        event_type="order_completed",
        payload={
            "order_id": str(order.id),
            "amount": order.amount_kopeks,
            "client_name": user.name,
        },
    )

    # Notify worker about commission if worker is attached (Requirement 14.3)
    if order.worker_id is not None:
        await notification_service.notify(
            db=db,
            user_id=order.worker_id,
            event_type="order_completed_worker_commission",
            payload={
                "order_id": str(order.id),
                "amount": order.amount_kopeks,
                "client_name": user.name,
            },
        )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


@router.patch("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Клиент отменяет заказ.

    Переход: PENDING_PAYMENT → CANCELLED.
    Только клиент-владелец заказа может отменить его.
    Использует transition_order для валидации перехода и записи в историю.
    """
    # Verify user is a client
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут отменять заказы",
        )

    # Fetch order
    order_result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
    )
    order = order_result.scalar_one_or_none()

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Check ownership
    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь владельцем этого заказа",
        )

    # Transition via state machine (validates PENDING_PAYMENT → CANCELLED)
    order = await transition_order(
        db, order, MarketplaceOrderStatus.CANCELLED, user.id
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)
