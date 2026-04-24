from fastapi import Depends, HTTPException, Request, status

from dependencies.auth import get_current_user
from enums.user import UserRole
from models.user import User
from utils.blogger_cabinet_unlock import (
    BLOGGER_CABINET_COOKIE_NAME,
    BLOGGER_CABINET_HEADER_NAME,
    verify_blogger_cabinet_unlock_token,
)


def require_blogger_cabinet_unlocked(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    if user.role != UserRole.BLOGER:
        return user
    if not user.blogger_cabinet_pin_hash:
        return user
    token = request.headers.get(BLOGGER_CABINET_HEADER_NAME) or request.cookies.get(
        BLOGGER_CABINET_COOKIE_NAME,
    )
    if token and verify_blogger_cabinet_unlock_token(token.strip(), user.id):
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Кабинет заблокирован PIN-кодом. Разблокируйте его на странице входа в кабинет.",
    )
