"""Админские эндпоинты: шаблоны сообщений для кабинета работника."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.auth import get_current_admin
from dependencies.database import get_db
from models.user import User
from schemas.worker_message_script import (
    WorkerMessageScriptCreate,
    WorkerMessageScriptPatch,
    WorkerMessageScriptRead,
    WorkerScriptCategoriesResponse,
)
from services.worker_message_script_service import (
    admin_create_worker_script,
    admin_delete_worker_script,
    admin_get_worker_script,
    admin_list_worker_scripts,
    admin_patch_worker_script,
    list_worker_script_categories,
)

router = APIRouter(prefix="/admin", tags=["admin", "worker-message-scripts"])


@router.get("/worker-message-scripts", response_model=list[WorkerMessageScriptRead])
async def get_admin_worker_message_scripts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> list[WorkerMessageScriptRead]:
    rows = await admin_list_worker_scripts(db)
    return [WorkerMessageScriptRead.model_validate(r) for r in rows]


@router.get("/worker-message-scripts/categories", response_model=WorkerScriptCategoriesResponse)
async def get_admin_worker_script_categories(
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> WorkerScriptCategoriesResponse:
    categories = await list_worker_script_categories(db)
    return WorkerScriptCategoriesResponse(categories=categories)


@router.post("/worker-message-scripts", response_model=WorkerMessageScriptRead)
async def post_admin_worker_message_script(
    body: WorkerMessageScriptCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> WorkerMessageScriptRead:
    row = await admin_create_worker_script(body, db)
    return WorkerMessageScriptRead.model_validate(row)


@router.get("/worker-message-scripts/{script_id}", response_model=WorkerMessageScriptRead)
async def get_admin_worker_message_script(
    script_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> WorkerMessageScriptRead:
    row = await admin_get_worker_script(script_id, db)
    return WorkerMessageScriptRead.model_validate(row)


@router.patch("/worker-message-scripts/{script_id}", response_model=WorkerMessageScriptRead)
async def patch_admin_worker_message_script(
    script_id: uuid.UUID,
    body: WorkerMessageScriptPatch,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> WorkerMessageScriptRead:
    row = await admin_patch_worker_script(script_id, body, db)
    return WorkerMessageScriptRead.model_validate(row)


@router.delete("/worker-message-scripts/{script_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_worker_message_script(
    script_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    _admin: Annotated[User, Depends(get_current_admin)],
) -> Response:
    await admin_delete_worker_script(script_id, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
