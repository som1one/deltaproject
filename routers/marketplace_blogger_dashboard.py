"""Роутер кабинета блогера на маркетплейсе (2-й уровень рефералки).

Эндпоинты для просмотра приведённых воркеров, истории комиссий 2-го уровня
и сводной статистики. Доступ — только для роли Bloger.

Реферальная ссылка блогера отдаётся в `/me` (`referral_invite_url`), поэтому
отдельного эндпоинта для неё здесь нет.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_user
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.blogger_dashboard import (
    BloggerMarketplaceStats,
    RecruitedWorkerListResponse,
)
from schemas.worker_dashboard import CommissionListResponse
from services import blogger_dashboard_service

router = APIRouter(
    prefix="/marketplace/blogger", tags=["marketplace-blogger-dashboard"]
)


def _require_blogger(user: User) -> None:
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только блогерам",
        )


@router.get("/recruited-workers", response_model=RecruitedWorkerListResponse)
async def get_recruited_workers(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Номер страницы"),
    page_size: int = Query(default=50, ge=1, le=50, description="Размер страницы"),
) -> RecruitedWorkerListResponse:
    """Список приведённых воркеров блогера (linked_to == blogger_id)."""
    _require_blogger(user)

    items, total = await blogger_dashboard_service.get_recruited_workers(
        db=db, blogger_id=user.id, page=page, page_size=page_size
    )

    return RecruitedWorkerListResponse(
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
    """История начислений комиссий блогеру-рефереру (2-й уровень)."""
    _require_blogger(user)

    items, total = await blogger_dashboard_service.get_commission_history(
        db=db, blogger_id=user.id, page=page, page_size=page_size
    )

    return CommissionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=BloggerMarketplaceStats)
async def get_stats(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerMarketplaceStats:
    """Сводная статистика блогера: баланс, заработок 2-го уровня, кол-во воркеров, отток."""
    _require_blogger(user)

    return await blogger_dashboard_service.get_stats(db=db, blogger_id=user.id)
