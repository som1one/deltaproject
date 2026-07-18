"""Вебхуки ЮKassa (без JWT)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from dependencies.database import get_db
from services.yookassa_webhook_service import handle_yukassa_notification

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/yookassa")
async def yookassa_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_yukassa_webhook_secret: Annotated[str | None, Header(alias="X-Yukassa-Webhook-Secret")] = None,
    secret: Annotated[str | None, Query()] = None,
) -> dict[str, bool]:
    # ЮKassa не умеет слать кастомные заголовки, поэтому секрет принимаем
    # и query-параметром: URL вебхука в кабинете — .../webhooks/yookassa?secret=<...>
    expected = settings.yukassa_webhook_secret.strip()
    if expected and x_yukassa_webhook_secret != expected and secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON",
        ) from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected object")
    await handle_yukassa_notification(body, db)
    return {"ok": True}
