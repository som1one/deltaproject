"""Роутер кабинета воркера на маркетплейсе.

Эндпоинты для просмотра рефералов, истории комиссий
и сводной статистики. Доступ — только для роли Worker.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.worker_dashboard import (
    CommissionListResponse,
    ReferralListResponse,
    WorkerMarketplaceStats,
)
from services import worker_dashboard_service

router = APIRouter(prefix="/marketplace/worker", tags=["marketplace-worker-dashboard"])


@router.get("/referrals", response_model=ReferralListResponse)
async def get_referrals(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=50, ge=1, le=50, description="Размер страницы"),
) -> ReferralListResponse:
    """Список приведённых заказчиков (рефералов) воркера с пагинацией."""
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только воркерам",
        )

    items, total = await worker_dashboard_service.get_referrals(
        db=db, worker_id=user.id, page=page, page_size=page_size
    )

    return ReferralListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/commissions", response_model=CommissionListResponse)
async def get_commissions(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=50, ge=1, le=50, description="Размер страницы"),
) -> CommissionListResponse:
    """История начислений комиссий воркеру с пагинацией."""
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только воркерам",
        )

    items, total = await worker_dashboard_service.get_commission_history(
        db=db, worker_id=user.id, page=page, page_size=page_size
    )

    return CommissionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=WorkerMarketplaceStats)
async def get_stats(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WorkerMarketplaceStats:
    """Сводная статистика воркера: баланс, общий заработок, кол-во рефералов."""
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только воркерам",
        )

    return await worker_dashboard_service.get_stats(db=db, worker_id=user.id)
