"""Withdrawals Router — вывод средств для блогеров и воркеров маркетплейса.

POST /marketplace/withdrawals — создать запрос на вывод
GET  /marketplace/withdrawals — список выводов пользователя
GET  /marketplace/withdrawals/{id} — детали вывода
"""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.marketplace import WithdrawalStatus
from enums.user import UserRole
from models.marketplace_withdrawal import MarketplaceWithdrawal
from models.user import User
from schemas.marketplace_withdrawals import (
    WithdrawalListResponse,
    WithdrawalRequest,
    WithdrawalResponse,
)
from services.marketplace_payment_service import PaymentService, PaymentServiceError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketplace/withdrawals", tags=["marketplace-withdrawals"])

# Roles allowed to withdraw marketplace balance
_WITHDRAWAL_ROLES = {UserRole.BLOGER, UserRole.WORKER}


def _assert_withdrawal_role(user: User) -> None:
    """Проверяет, что пользователь имеет право на вывод средств."""
    if user.role not in _WITHDRAWAL_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Вывод средств доступен только блогерам и воркерам",
        )


@router.post(
    "",
    response_model=WithdrawalResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_withdrawal(
    body: WithdrawalRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WithdrawalResponse:
    """Создать запрос на вывод средств.

    Валидация:
    - amount_kopeks >= 100 (1.00 RUB)
    - amount_kopeks <= marketplace_balance_kopeks
    - У пользователя привязана карта (payout_card_hash)

    Использует SELECT FOR UPDATE на строке пользователя для защиты от гонок.
    """
    _assert_withdrawal_role(user)

    # Validate card linked
    if not user.payout_card_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходимо привязать банковскую карту перед выводом средств",
        )

    # Lock user row for concurrent withdrawal protection
    lock_query = (
        select(User)
        .where(User.id == user.id)
        .with_for_update()
    )
    result = await db.execute(lock_query)
    locked_user = result.scalar_one()

    # Validate amount <= balance
    if body.amount_kopeks > locked_user.marketplace_balance_kopeks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сумма вывода превышает доступный баланс",
        )

    # Deduct balance
    new_balance = locked_user.marketplace_balance_kopeks - body.amount_kopeks
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(marketplace_balance_kopeks=new_balance)
    )

    # Create withdrawal record
    withdrawal = MarketplaceWithdrawal(
        user_id=user.id,
        amount_kopeks=body.amount_kopeks,
        status=WithdrawalStatus.PENDING.value,
    )
    db.add(withdrawal)
    await db.flush()  # Get the ID before commit

    # Attempt payout via YooKassa
    try:
        payout_result = await PaymentService.create_payout(
            user_id=user.id,
            amount_kopeks=body.amount_kopeks,
            payout_token=locked_user.payout_card_hash,
            db=db,
            withdrawal_id=withdrawal.id,
        )
        # payout_id is already stored on withdrawal by PaymentService
    except PaymentServiceError:
        # PaymentService already restores balance and sets FAILED status on error
        await db.refresh(withdrawal)
        return WithdrawalResponse.model_validate(withdrawal)

    await db.commit()
    await db.refresh(withdrawal)

    return WithdrawalResponse.model_validate(withdrawal)


@router.get("", response_model=WithdrawalListResponse)
async def list_withdrawals(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=20, ge=1, le=50, description="Размер страницы"),
) -> WithdrawalListResponse:
    """Список запросов на вывод текущего пользователя."""
    _assert_withdrawal_role(user)

    # Count total
    count_query = (
        select(func.count())
        .select_from(MarketplaceWithdrawal)
        .where(MarketplaceWithdrawal.user_id == user.id)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Fetch paginated results
    offset = (page - 1) * page_size
    items_query = (
        select(MarketplaceWithdrawal)
        .where(MarketplaceWithdrawal.user_id == user.id)
        .order_by(MarketplaceWithdrawal.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(items_query)
    withdrawals = result.scalars().all()

    return WithdrawalListResponse(
        items=[WithdrawalResponse.model_validate(w) for w in withdrawals],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{withdrawal_id}", response_model=WithdrawalResponse)
async def get_withdrawal(
    withdrawal_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WithdrawalResponse:
    """Детали конкретного запроса на вывод."""
    _assert_withdrawal_role(user)

    query = select(MarketplaceWithdrawal).where(
        MarketplaceWithdrawal.id == withdrawal_id,
        MarketplaceWithdrawal.user_id == user.id,
    )
    result = await db.execute(query)
    withdrawal = result.scalar_one_or_none()

    if withdrawal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Запрос на вывод не найден",
        )

    return WithdrawalResponse.model_validate(withdrawal)
