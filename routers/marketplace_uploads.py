"""Загрузка изображений маркетплейса: аватары и скриншоты статистики.

Файлы сохраняются в локальную директорию (settings.uploads_dir) и
раздаются приложением по /uploads/... Ограничения: только изображения,
до 15 МБ.
"""

from __future__ import annotations

import secrets
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from core.settings import settings
from dependencies.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/marketplace/uploads", tags=["marketplace-uploads"])

# 15 МБ: скриншоты статистики с ретины и телефонов спокойно весят 6–10 МБ
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
_ALLOWED_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _sniff_extension(data: bytes) -> str | None:
    """Определяем формат по сигнатуре файла — заголовку Content-Type не верим."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def uploads_root() -> Path:
    root = Path(getattr(settings, "uploads_dir", "uploads"))
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile,
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str]:
    """Загрузить изображение. Возвращает {"url": "/uploads/..."}."""
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Поддерживаются только изображения: JPEG, PNG, WebP, GIF",
        )

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл больше 15 МБ",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой файл",
        )

    # Расширение берём из реальной сигнатуры, а не из заголовка клиента
    extension = _sniff_extension(data)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Файл не похож на изображение (JPEG, PNG, WebP, GIF)",
        )

    # Имя не зависит от пользовательского ввода: uuid + случайный суффикс
    filename = f"{uuid.uuid4().hex}{secrets.token_hex(4)}{extension}"
    target = uploads_root() / filename
    target.write_bytes(data)

    return {"url": f"/uploads/{filename}"}
