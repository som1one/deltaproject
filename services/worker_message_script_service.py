import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.worker_message_script import WorkerMessageScript
from schemas.worker_message_script import WorkerMessageScriptCreate, WorkerMessageScriptPatch


async def list_worker_scripts_public(db: AsyncSession) -> list[WorkerMessageScript]:
    result = await db.execute(
        select(WorkerMessageScript).order_by(
            WorkerMessageScript.sort_order.asc(),
            WorkerMessageScript.created_at.asc(),
        ),
    )
    return list(result.scalars().all())


async def admin_list_worker_scripts(db: AsyncSession) -> list[WorkerMessageScript]:
    return await list_worker_scripts_public(db)


async def admin_get_worker_script(script_id: uuid.UUID, db: AsyncSession) -> WorkerMessageScript:
    row = await db.get(WorkerMessageScript, script_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Скрипт не найден")
    return row


async def admin_create_worker_script(
    body: WorkerMessageScriptCreate,
    db: AsyncSession,
) -> WorkerMessageScript:
    row = WorkerMessageScript(
        title=body.title.strip(),
        body=body.body.strip(),
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def admin_patch_worker_script(
    script_id: uuid.UUID,
    body: WorkerMessageScriptPatch,
    db: AsyncSession,
) -> WorkerMessageScript:
    row = await admin_get_worker_script(script_id, db)
    if body.title is not None:
        row.title = body.title.strip()
    if body.body is not None:
        row.body = body.body.strip()
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    await db.commit()
    await db.refresh(row)
    return row


async def admin_delete_worker_script(script_id: uuid.UUID, db: AsyncSession) -> None:
    row = await admin_get_worker_script(script_id, db)
    await db.delete(row)
    await db.commit()
