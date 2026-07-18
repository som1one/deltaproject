"""Payments Router for the Blogger Marketplace.

Handles payment creation and status checking for marketplace orders.
- POST /marketplace/payments/{order_id}/create — create YooKassa payment
- GET /marketplace/payments/{order_id}/status — check payment status
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus
from models.marketplace_order import MarketplaceOrder
from models.user import User
from schemas.marketplace_payments import PaymentCreateResponse, PaymentStatusResponse
from services.marketplace_payment_service import PaymentService, PaymentServiceError

router = APIRouter(prefix="/marketplace/payments", tags=["marketplace-payments"])


@router.post(
    "/{order_id}/create",
    response_model=PaymentCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_payment(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a YooKassa payment for a marketplace order.

    The authenticated user must be the client who placed the order.
    The order must be in PENDING_PAYMENT status.
    """
    # Fetch the order
    result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id),
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Verify the order belongs to the current user
    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещён: заказ принадлежит другому пользователю",
        )

    # Verify order is in correct status
    if order.status != MarketplaceOrderStatus.PENDING_PAYMENT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Заказ в статусе {order.status}, оплата невозможна",
        )

    # Build return URL for YooKassa redirect — страница сделки на фронте
    # (/orders/{id} в Next), НЕ /marketplace/orders/{id}: этот путь nginx
    # проксирует в FastAPI, и клиент после оплаты видел голый JSON про Bearer.
    base_url = settings.marketplace_frontend_url.rstrip("/")
    return_url = f"{base_url}/orders/{order_id}"

    try:
        payment_result = await PaymentService.create_payment(
            order_id=order.id,
            amount_kopeks=order.amount_kopeks,
            return_url=return_url,
            customer_email=user.email,
            db=db,
        )
    except PaymentServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    return PaymentCreateResponse(
        order_id=order.id,
        payment_id=payment_result.payment_id,
        payment_url=payment_result.payment_url,
        expires_at=payment_result.expires_at,
    )


@router.get(
    "/{order_id}/status",
    response_model=PaymentStatusResponse,
)
async def get_payment_status(
    order_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Check payment status for a marketplace order.

    The authenticated user must be the client who placed the order.
    Returns the current payment status derived from the order fields.
    """
    # Fetch the order
    result = await db.execute(
        select(MarketplaceOrder).where(MarketplaceOrder.id == order_id),
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Verify the order belongs to the current user
    if order.client_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещён: заказ принадлежит другому пользователю",
        )

    # Fallback на недошедший вебхук: сверяем статус с YooKassa напрямую
    if await PaymentService.sync_payment_status(order, db=db):
        await db.refresh(order)

    # Derive payment status from order status
    if order.status == MarketplaceOrderStatus.PENDING_PAYMENT.value:
        payment_status = "pending"
        paid = False
    elif order.status == MarketplaceOrderStatus.PAYMENT_FAILED.value:
        payment_status = "canceled"
        paid = False
    else:
        # ESCROW_HELD, BLOGGER_CONFIRMED, COMPLETED, REFUNDED — all mean payment succeeded
        payment_status = "succeeded"
        paid = True

    return PaymentStatusResponse(
        order_id=order.id,
        payment_id=order.yookassa_payment_id,
        status=payment_status,
        paid=paid,
        amount_kopeks=order.amount_kopeks,
    )
