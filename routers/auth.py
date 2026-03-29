from fastapi import APIRouter, Depends, HTTPException, Request
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import limiter
from core.settings import settings
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.auth import LoginRequest, RefreshRequest, RegisterRequest
from services.auth_service import create_user
from services.session_service import (
    assert_login_allowed_for_ip,
    assert_referral_registration_allowed_for_ip,
    assert_registration_allowed_for_ip,
    record_user_session,
)
from utils.request_ip import get_client_ip
from utils.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_payload,
    verify_access_token,
    verify_refresh_token,
)
from utils.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
@limiter.limit(settings.rate_limit_register)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    await assert_registration_allowed_for_ip(db, client_ip)
    email_exists = await db.execute(select(User).where(User.email == body.email))
    if email_exists.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")
    if body.linked_to is not None:
        ref_user = await db.get(User, body.linked_to)
        if ref_user is None or ref_user.role != UserRole.BLOGER:
            raise HTTPException(
                status_code=400,
                detail="Некорректный linked_to: нужен существующий пользователь с ролью блогера",
            )
        await assert_referral_registration_allowed_for_ip(db, client_ip, body.linked_to)
    user = await create_user(body, db)
    await record_user_session(
        db,
        client_ip,
        request.headers.get("user-agent", ""),
        user_id=user.id,
        session_kind="register",
    )
    token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    return {
        "message": "User created successfully",
        "token": token,
        "refresh_token": refresh_token,
    }


@router.post("/login")
@limiter.limit(settings.rate_limit_login)
async def login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Вход только для администратора."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hash_pass):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь деактивирован")
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Вход через этот endpoint доступен только администратору")
    client_ip = get_client_ip(request)
    await assert_login_allowed_for_ip(db, client_ip)
    await record_user_session(
        db,
        client_ip,
        request.headers.get("user-agent", ""),
        user_id=user.id,
        session_kind="login",
    )
    token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    return {
        "message": "Login successful",
        "token": token,
        "refresh_token": refresh_token,
    }


@router.post("/user-login")
@limiter.limit(settings.rate_limit_login)
async def user_login(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Вход для Worker/Bloger (не-админов)."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hash_pass):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь деактивирован")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Для администратора используйте /auth/login")
    client_ip = get_client_ip(request)
    await assert_login_allowed_for_ip(db, client_ip)
    await record_user_session(
        db,
        client_ip,
        request.headers.get("user-agent", ""),
        user_id=user.id,
        session_kind="login",
    )
    token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    return {
        "message": "Login successful",
        "token": token,
        "refresh_token": refresh_token,
    }


@router.post("/refresh")
@limiter.limit(settings.rate_limit_refresh)
async def refresh_tokens(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = verify_refresh_token(body.refresh_token.strip())
        user_id = get_user_id_from_payload(payload)
    except PyJWTError:
        raise HTTPException(
            status_code=401,
            detail="Невалидный или просроченный refresh-токен",
        ) from None
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    access = create_access_token(user.id)
    new_refresh = create_refresh_token(user.id)
    return {
        "token": access,
        "refresh_token": new_refresh,
    }


@router.post("/logout")
@limiter.limit(settings.rate_limit_logout)
async def logout(request: Request):
    raw = request.headers.get("Authorization")
    if not raw:
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = raw.removeprefix("Bearer ").strip() if raw.startswith("Bearer ") else raw
    try:
        verify_access_token(token)
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Unauthorized") from None
    return {"message": "Logout successful"}
