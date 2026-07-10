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
from enums.marketplace import MarketplaceOrderStatus, SupportTicketStatus, SupportTicketSubject
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
    """Create a support ticket.

    Only Clients and Bloggers can create tickets.
    A "dispute" ticket must reference a paid deal (ESCROW_HELD / BLOGGER_CONFIRMED)
    the user participates in. Other topics may omit the deal, or attach one the
    user participates in. Message must be 1-2000 characters and not whitespace-only.
    """
    # Check role
    if user.role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создание тикетов доступно только клиентам и блогерам",
        )

    order_id = body.order_id

    if body.subject == SupportTicketSubject.DISPUTE:
        # Спор — только по существующей оплаченной сделке, где пользователь участник.
        # (order_id гарантированно не None: проверено валидатором схемы.)
        order = await db.get(MarketplaceOrder, order_id)
        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заказ не найден",
            )
        if order.status not in _ALLOWED_ORDER_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Спор можно открыть только по сделке в статусе ESCROW_HELD или BLOGGER_CONFIRMED",
            )
        if user.id != order.client_id and user.id != order.blogger_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Вы не являетесь участником этой сделки",
            )
    elif order_id is not None:
        # Необязательная привязка сделки к общему вопросу — проверяем существование и участие.
        order = await db.get(MarketplaceOrder, order_id)
        if order is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Заказ не найден",
            )
        if user.id != order.client_id and user.id != order.blogger_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Вы не являетесь участником этой сделки",
            )

    # Create the support ticket
    ticket = SupportTicket(
        order_id=order_id,
        submitter_id=user.id,
        submitter_role=user.role.value,
        subject=body.subject.value,
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
