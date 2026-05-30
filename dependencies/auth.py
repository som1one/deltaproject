import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWTError
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from utils.jwt_tokens import get_user_id_from_payload, verify_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_access_token_string(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется Bearer access-токен",
        )
    token = credentials.credentials.strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пустой токен",
        )
    return token


async def get_current_user_id(
    token: Annotated[str, Depends(get_access_token_string)],
) -> uuid.UUID:
    try:
        payload = verify_access_token(token)
        return get_user_id_from_payload(payload)
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный access-токен",
        ) from None


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[uuid.UUID, Depends(get_current_user_id)],
) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь деактивирован",
        )
    return user


async def get_current_blogger(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только блогерам",
        )
    return user


async def get_current_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно только администраторам",
        )
    return user


async def get_current_admin_or_tech(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role not in (UserRole.ADMIN, UserRole.TECH_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступно администраторам",
        )
    return user
