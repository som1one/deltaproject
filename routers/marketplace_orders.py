"""Роутер заказов маркетплейса блогеров.

Обеспечивает создание заказов, просмотр списка/деталей,
а также переходы статусов (complete, confirm) с атомарными проверками.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, update
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
    OrderListResponse,
    OrderResponse,
)
from services import marketplace_escrow_service

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
    # Worker commission only if client was referred by a worker
    worker_commission_pct = (
        settings.worker_referral_commission_pct
        if user.marketplace_referred_by is not None
        else Decimal("0.00")
    )

    # Create order
    order = MarketplaceOrder(
        client_id=user.id,
        blogger_id=body.blogger_id,
        worker_id=user.marketplace_referred_by,
        status=MarketplaceOrderStatus.PENDING_PAYMENT.value,
        amount_kopeks=profile.average_price_kopeks,
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

    return OrderListResponse(
        items=[OrderResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Детали заказа с проверкой доступа.

    Доступно клиенту-владельцу заказа или назначенному блогеру.
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

    # Auth check: only order client or assigned blogger can view
    if user.id != order.client_id and user.id != order.blogger_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этому заказу",
        )

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
    Использует атомарный UPDATE ... WHERE status = expected_status.
    """
    # Verify user is a blogger
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только блогеры могут отмечать заказы выполненными",
        )

    # Atomic update: only if order belongs to this blogger AND status is ESCROW_HELD
    stmt = (
        update(MarketplaceOrder)
        .where(
            MarketplaceOrder.id == order_id,
            MarketplaceOrder.blogger_id == user.id,
            MarketplaceOrder.status == MarketplaceOrderStatus.ESCROW_HELD.value,
        )
        .values(
            status=MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        )
        .returning(MarketplaceOrder)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if order is None:
        # Determine the reason for failure
        existing_result = await db.execute(
            select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
        )
        existing_order = existing_result.scalar_one_or_none()

        if existing_order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заказ не найден",
            )

        if existing_order.blogger_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Вы не являетесь исполнителем этого заказа",
            )

        # Status mismatch
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Невозможно завершить заказ в статусе {existing_order.status}",
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
    После подтверждения вызывается distribute_funds для распределения средств.
    Использует атомарный UPDATE ... WHERE status = expected_status.
    """
    # Verify user is a client
    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Только клиенты могут подтверждать доставку",
        )

    # Atomic update: only if order belongs to this client AND status is BLOGGER_CONFIRMED
    stmt = (
        update(MarketplaceOrder)
        .where(
            MarketplaceOrder.id == order_id,
            MarketplaceOrder.client_id == user.id,
            MarketplaceOrder.status == MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
        )
        .values(
            status=MarketplaceOrderStatus.COMPLETED.value,
            completed_at=func.now(),
        )
        .returning(MarketplaceOrder)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if order is None:
        # Determine the reason for failure
        existing_result = await db.execute(
            select(MarketplaceOrder).where(MarketplaceOrder.id == order_id)
        )
        existing_order = existing_result.scalar_one_or_none()

        if existing_order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заказ не найден",
            )

        if existing_order.client_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Вы не являетесь владельцем этого заказа",
            )

        # Status mismatch
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Невозможно подтвердить заказ в статусе {existing_order.status}",
        )

    # Distribute funds after successful confirmation
    await marketplace_escrow_service.distribute_funds(
        order_id=order.id,
        db=db,
    )

    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)
