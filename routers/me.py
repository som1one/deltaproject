from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import key_user_id_or_client_ip, limiter
from core.settings import settings
from dependencies.auth import get_current_user
from dependencies.blogger_cabinet import require_blogger_cabinet_unlocked
from dependencies.database import get_db
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.user import User
from schemas.ledger import (
    LedgerEntryRead,
    LedgerListResponse,
    PayoutRequestCreate,
    PayoutWidgetConfigResponse,
)
from schemas.blogger_option import BloggerOptionRead
from schemas.me import (
    BloggerMeStatsRead,
    CabinetUnlockBody,
    CabinetUnlockResponse,
    MeDealsResponse,
    MeStatsResponse,
    PayoutCardSet,
    UserMePatch,
    UserMeRead,
    WorkerMeStatsRead,
)
from schemas.worker_message_script import WorkerMessageScriptRead, WorkerScriptCategoriesResponse
from services.deal_service import deal_to_read, list_deals_for_user
from services.ledger_service import create_payout_request, list_ledger_for_user
from services.me_service import (
    apply_me_patch,
    compute_worker_me_stats,
    get_or_create_blogger_stat,
    get_or_create_worker_stat,
    set_me_payout_card,
    user_to_me_read,
)
from services.worker_message_script_service import list_worker_script_categories, list_worker_scripts_public
from sqlalchemy import select
from utils.blogger_cabinet_unlock import BLOGGER_CABINET_COOKIE_NAME, create_blogger_cabinet_unlock_token
from utils.security import verify_password

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserMeRead)
async def get_me(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserMeRead:
    return await user_to_me_read(user, db, request)


@router.post("/cabinet-unlock", response_model=CabinetUnlockResponse)
async def post_cabinet_unlock(
    body: CabinetUnlockBody,
    user: Annotated[User, Depends(get_current_user)],
) -> JSONResponse:
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Разблокировка кабинета доступна только блогеру",
        )
    if not user.blogger_cabinet_pin_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PIN кабинета не установлен. Обратитесь к администратору.",
        )
    if not verify_password(body.pin, user.blogger_cabinet_pin_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный PIN")
    token = create_blogger_cabinet_unlock_token(user.id)
    response = JSONResponse(content=CabinetUnlockResponse(ok=True, unlock_token=token).model_dump())
    response.set_cookie(
        key=BLOGGER_CABINET_COOKIE_NAME,
        value=token,
        max_age=settings.blogger_cabinet_unlock_ttl_seconds,
        httponly=True,
        samesite="lax",
        path="/",
        secure=settings.app_env.lower() == "production",
    )
    return response


@router.patch("", response_model=UserMeRead)
async def patch_me(
    request: Request,
    body: UserMePatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserMeRead:
    await apply_me_patch(user, body, db)
    await db.refresh(user)
    return await user_to_me_read(user, db, request)


@router.post("/payout-card", response_model=UserMeRead)
async def post_me_payout_card(
    request: Request,
    body: PayoutCardSet,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> UserMeRead:
    await set_me_payout_card(user, body, db)
    return await user_to_me_read(user, db, request)


@router.get("/deals", response_model=MeDealsResponse)
@limiter.limit(settings.rate_limit_deal_read, key_func=key_user_id_or_client_ip)
async def get_my_deals(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_blogger_cabinet_unlocked)],
) -> MeDealsResponse:
    rows = await list_deals_for_user(user, db)
    deals = [await deal_to_read(d, user, db) for d in rows]
    return MeDealsResponse(deals=deals)


@router.get("/ledger", response_model=LedgerListResponse)
async def get_my_ledger(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_blogger_cabinet_unlocked)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[LedgerEntryStatus | None, Query(description="Фильтр по статусу")] = None,
) -> LedgerListResponse:
    items, total = await list_ledger_for_user(
        user.id,
        db,
        limit=limit,
        offset=offset,
        status_filter=status,
    )
    return LedgerListResponse(
        items=[LedgerEntryRead.model_validate(row) for row in items],
        total=total,
    )


@router.get("/payout-widget-config", response_model=PayoutWidgetConfigResponse)
async def get_payout_widget_config(
    user: Annotated[User, Depends(require_blogger_cabinet_unlocked)],
) -> PayoutWidgetConfigResponse:
    """Параметры виджета ЮKassa (gateway_id безопасен для фронта)."""
    if user.role not in (UserRole.WORKER, UserRole.BLOGER):
        return PayoutWidgetConfigResponse(enabled=False, gateway_id=None)
    gw = settings.yukassa_payout_gateway_id.strip() or None
    return PayoutWidgetConfigResponse(
        enabled=settings.yukassa_payout_widget_ready,
        gateway_id=gw,
    )


@router.post("/payout-requests", response_model=LedgerEntryRead)
async def post_payout_request(
    body: PayoutRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_blogger_cabinet_unlocked)],
) -> LedgerEntryRead:
    entry = await create_payout_request(user, body, db)
    return LedgerEntryRead.model_validate(entry)


@router.get("/stats", response_model=MeStatsResponse)
async def get_me_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_blogger_cabinet_unlocked)],
) -> WorkerMeStatsRead | BloggerMeStatsRead:
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Статистика кабинета для этой роли не предусмотрена",
        )
    if user.role == UserRole.WORKER:
        return await compute_worker_me_stats(user.id, db)
    if user.role == UserRole.BLOGER:
        row = await get_or_create_blogger_stat(user.id, db)
        return BloggerMeStatsRead.model_validate(row)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Неизвестная роль",
    )


@router.get("/available-bloggers", response_model=list[BloggerOptionRead])
async def get_available_bloggers_for_worker(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[BloggerOptionRead]:
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Список блогеров доступен только работнику",
        )
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.BLOGER, User.is_active.is_(True))
        .order_by(User.name.asc()),
    )
    rows = result.scalars().all()
    return [BloggerOptionRead.model_validate(u) for u in rows]


@router.get("/worker-message-scripts", response_model=list[WorkerMessageScriptRead])
async def get_worker_message_scripts_for_cabinet(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    category: str | None = Query(None, description="Фильтр по категории"),
    keyword: str | None = Query(None, description="Фильтр по ключевому слову"),
    search: str | None = Query(None, description="Поиск по заголовку/тексту"),
) -> list[WorkerMessageScriptRead]:
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Скрипты доступны только работнику",
        )
    items = await list_worker_scripts_public(db, category=category, keyword=keyword, search=search)
    return [WorkerMessageScriptRead.model_validate(s) for s in items]


@router.get("/worker-message-scripts/categories", response_model=WorkerScriptCategoriesResponse)
async def get_worker_script_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> WorkerScriptCategoriesResponse:
    if user.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Скрипты доступны только работнику",
        )
    categories = await list_worker_script_categories(db)
    return WorkerScriptCategoriesResponse(categories=categories)
