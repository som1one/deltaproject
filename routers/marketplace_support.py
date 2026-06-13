"""Support Router for the Blogger Marketplace.

Handles support ticket creation and retrieval for Clients and Bloggers.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import MarketplaceOrderStatus, SupportTicketStatus
from enums.user import UserRole
from models.marketplace_order import MarketplaceOrder
from models.support_ticket import SupportTicket
from models.user import User
from schemas.marketplace_support import (
    TicketCreateRequest,
    TicketListResponse,
    TicketResponse,
)

router = APIRouter(prefix="/marketplace/support", tags=["marketplace-support"])

# Allowed roles for support ticket submission
_ALLOWED_ROLES = {UserRole.CLIENT, UserRole.BLOGER}

# Order statuses that allow support ticket creation
_ALLOWED_ORDER_STATUSES = {
    MarketplaceOrderStatus.ESCROW_HELD.value,
    MarketplaceOrderStatus.BLOGGER_CONFIRMED.value,
}


@router.post("/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    body: TicketCreateRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TicketResponse:
    """Create a support ticket for an order.

    Only Clients and Bloggers can create tickets.
    The order must be in ESCROW_HELD or BLOGGER_CONFIRMED status.
    The user must be either the client or blogger of the order.
    Message must be 1-2000 characters and not whitespace-only.
    """
    # Check role
    if user.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создание тикетов доступно только клиентам и блогерам",
        )

    # Fetch the order
    order = await db.get(MarketplaceOrder, body.order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Заказ не найден",
        )

    # Verify order status allows support ticket creation
    if order.status not in _ALLOWED_ORDER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Тикет можно создать только для заказов в статусе ESCROW_HELD или BLOGGER_CONFIRMED",
        )

    # Verify user is either the client or blogger of the order
    if user.id != order.client_id and user.id != order.blogger_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вы не являетесь участником этого заказа",
        )

    # Determine submitter role
    submitter_role = user.role

    # Create the support ticket
    ticket = SupportTicket(
        order_id=body.order_id,
        submitter_id=user.id,
        submitter_role=submitter_role.value,
        message=body.message,
        status=SupportTicketStatus.OPEN.value,
    )
    db.add(ticket)
    await db.flush()
    await db.refresh(ticket)
    await db.commit()

    return TicketResponse.model_validate(ticket)


@router.get("/tickets", response_model=TicketListResponse)
async def list_support_tickets(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=20, ge=1, le=100, description="Размер страницы"),
) -> TicketListResponse:
    """List support tickets submitted by the current user."""
    # Count total tickets for this user
    count_query = (
        select(func.count())
        .select_from(SupportTicket)
        .where(SupportTicket.submitter_id == user.id)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Fetch paginated tickets
    offset = (page - 1) * page_size
    items_query = (
        select(SupportTicket)
        .where(SupportTicket.submitter_id == user.id)
        .order_by(SupportTicket.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(items_query)
    tickets = result.scalars().all()

    return TicketListResponse(
        items=[TicketResponse.model_validate(t) for t in tickets],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_support_ticket(
    ticket_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TicketResponse:
    """Get details of a specific support ticket.

    Only the submitter can view their own ticket.
    """
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Тикет не найден",
        )

    # Only the submitter can view their ticket
    if ticket.submitter_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ запрещён",
        )

    return TicketResponse.model_validate(ticket)
