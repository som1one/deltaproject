"""Загрузка файлов маркетплейса: аватары, скриншоты и вложения чата.

Файлы сохраняются в локальную директорию (settings.uploads_dir) и
раздаются приложением по /uploads/...

Два контура:
  • /marketplace/uploads — аватары и скриншоты статистики: только
    изображения, до 15 МБ, хранятся бессрочно (корень uploads/).
  • /marketplace/uploads/chat — вложения чата: фото, видео и документы,
    до 100 МБ, лежат в uploads/chat/ и удаляются через 7 дней
    (фоновая чистка в main.py).
"""

from __future__ import annotations

import re
import secrets
import uuid
from pathlib import Path
from typing import Annotated, Callable

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from core.settings import settings
from dependencies.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/marketplace/uploads", tags=["marketplace-uploads"])

# 15 МБ: скриншоты статистики с ретины и телефонов спокойно весят 6–10 МБ
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# Вложения чата: видео с телефона легко весит десятки мегабайт
MAX_CHAT_UPLOAD_BYTES = 100 * 1024 * 1024
# Срок хранения вложений чата; после — удаление фоновой чисткой
CHAT_RETENTION_DAYS = 7
_CHAT_SUBDIR = "chat"
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


# ── Форматы вложений чата ────────────────────────────────────────────
# Расширение берём из имени файла, но содержимое обязано совпадать
# с сигнатурой семейства — переименованный exe не пройдёт.

def _is_jpeg(d: bytes) -> bool:
    return d.startswith(b"\xff\xd8\xff")


def _is_png(d: bytes) -> bool:
    return d.startswith(b"\x89PNG\r\n\x1a\n")


def _is_gif(d: bytes) -> bool:
    return d.startswith(b"GIF87a") or d.startswith(b"GIF89a")


def _is_webp(d: bytes) -> bool:
    return d[:4] == b"RIFF" and d[8:12] == b"WEBP"


def _is_mp4(d: bytes) -> bool:
    # MP4/MOV/M4V — ISO BMFF: бокс "ftyp" на смещении 4
    return len(d) >= 12 and d[4:8] == b"ftyp"


def _is_ebml(d: bytes) -> bool:
    # WebM/MKV — контейнер Matroska (EBML)
    return d.startswith(b"\x1a\x45\xdf\xa3")


def _is_pdf(d: bytes) -> bool:
    return d.startswith(b"%PDF-")


def _is_ole(d: bytes) -> bool:
    # Легаси-офис (doc/xls/ppt) — OLE Compound File
    return d.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def _is_zip(d: bytes) -> bool:
    # docx/xlsx/pptx и обычные архивы — ZIP-контейнер
    return d.startswith(b"PK\x03\x04")


def _is_rar(d: bytes) -> bool:
    return d.startswith(b"Rar!\x1a\x07")


def _is_text(d: bytes) -> bool:
    # У текста нет сигнатуры; отсекаем бинарники по NUL-байтам
    return b"\x00" not in d


# ext → (вид вложения для сообщения, проверка сигнатуры)
_CHAT_FORMATS: dict[str, tuple[str, Callable[[bytes], bool]]] = {
    "jpg": ("image", _is_jpeg),
    "jpeg": ("image", _is_jpeg),
    "png": ("image", _is_png),
    "webp": ("image", _is_webp),
    "gif": ("image", _is_gif),
    "mp4": ("video", _is_mp4),
    "mov": ("video", _is_mp4),
    "m4v": ("video", _is_mp4),
    "webm": ("video", _is_ebml),
    "mkv": ("video", _is_ebml),
    "pdf": ("file", _is_pdf),
    "doc": ("file", _is_ole),
    "xls": ("file", _is_ole),
    "ppt": ("file", _is_ole),
    "docx": ("file", _is_zip),
    "xlsx": ("file", _is_zip),
    "pptx": ("file", _is_zip),
    "zip": ("file", _is_zip),
    "rar": ("file", _is_rar),
    "txt": ("file", _is_text),
    "csv": ("file", _is_text),
}

_CHAT_FORMATS_HUMAN = (
    "фото (JPEG, PNG, WebP, GIF), видео (MP4, MOV, WebM, MKV), "
    "документы (PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP, RAR)"
)


def uploads_root() -> Path:
    root = Path(getattr(settings, "uploads_dir", "uploads"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def chat_uploads_root() -> Path:
    root = uploads_root() / _CHAT_SUBDIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def _clean_display_name(raw: str | None) -> str:
    """Оригинальное имя файла для показа в чате: без путей и мусора."""
    name = Path(raw or "").name
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return name[:150] or "файл"


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


@router.post("/chat", status_code=status.HTTP_201_CREATED)
async def upload_chat_file(
    file: UploadFile,
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, str | int]:
    """Загрузить вложение чата (фото, видео или документ, до 100 МБ).

    Возвращает {"url", "kind", "name", "size_bytes"}; kind — image|video|file.
    Файл живёт CHAT_RETENTION_DAYS дней, затем удаляется фоновой чисткой.
    """
    display_name = _clean_display_name(file.filename)
    extension = Path(display_name).suffix.lower().lstrip(".")
    entry = _CHAT_FORMATS.get(extension)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Такой формат не поддерживается. Можно отправлять: {_CHAT_FORMATS_HUMAN}.",
        )
    kind, matches_signature = entry

    head = await file.read(64 * 1024)
    if not head:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пустой файл",
        )
    if not matches_signature(head):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Содержимое не похоже на .{extension} — файл повреждён "
                "или у него подменено расширение."
            ),
        )

    filename = f"{uuid.uuid4().hex}{secrets.token_hex(4)}.{extension}"
    target = chat_uploads_root() / filename

    # Пишем на диск потоково: 100-мегабайтные видео не должны жить в памяти
    size = len(head)
    try:
        with target.open("wb") as out:
            out.write(head)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_CHAT_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=(
                            "Файл больше 100 МБ. Сожмите видео или "
                            "разбейте архив на части."
                        ),
                    )
                out.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except OSError:
        target.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить файл, попробуйте ещё раз",
        )

    return {
        "url": f"/uploads/{_CHAT_SUBDIR}/{filename}",
        "kind": kind,
        "name": display_name,
        "size_bytes": size,
    }
