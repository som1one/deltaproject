"""Client Auth Router for the Blogger Marketplace.

Handles client registration, login, and token refresh.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.auth import AuthTokensResponse
from schemas.marketplace_auth import (
    ClientLoginRequest,
    ClientRefreshRequest,
    ClientRegisterRequest,
)
from services.marketplace_referral_service import assign_referral, resolve_referral, ReferralAlreadyAssignedError
from utils.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_payload,
    verify_refresh_token,
)
from utils.security import hash_password, verify_password

router = APIRouter(prefix="/marketplace/auth", tags=["marketplace-auth"])


@router.post("/register", response_model=AuthTokensResponse, status_code=status.HTTP_201_CREATED)
async def register_client(
    body: ClientRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new Client on the marketplace.

    Validates name/email/password, checks email uniqueness,
    creates a Client user, resolves referral code (if provided),
    and returns access + refresh tokens.
    """
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == body.email))
    existing_user = result.scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким email уже существует",
        )

    # Resolve referral code if provided
    referred_by: uuid.UUID | None = None
    if body.referral_code:
        referred_by = await resolve_referral(body.referral_code, db)
        # Per requirement 4.3: if referral code is invalid/inactive,
        # allow registration without worker association (no error shown)

    # Create the Client user
    user = User(
        name=body.name,
        email=body.email,
        hash_pass=hash_password(body.password),
        role=UserRole.CLIENT,
        is_active=True,
        marketplace_referred_by=None,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    # Assign referral using immutable service (Requirement 6.1, 6.3)
    if referred_by is not None:
        await assign_referral(user.id, referred_by, db)
        await db.refresh(user)

    await db.commit()

    # Generate tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return AuthTokensResponse(
        message="Регистрация успешна",
        token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=AuthTokensResponse)
async def login_client(
    body: ClientLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a Client with email and password.

    Returns access + refresh tokens on success.
    Returns 401 for invalid credentials (without revealing which field is wrong).
    Returns 403 for inactive accounts.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hash_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт деактивирован",
        )

    if user.role != UserRole.CLIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Этот вход доступен только для заказчиков. Блогеры входят через основную платформу.",
        )

    # Generate tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return AuthTokensResponse(
        message="Login successful",
        token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=AuthTokensResponse)
async def refresh_tokens(
    body: ClientRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh JWT tokens using a valid refresh token.

    Expects JSON body: {"refresh_token": "..."}
    Returns new access + refresh token pair.
    """
    try:
        payload = verify_refresh_token(body.refresh_token.strip())
        user_id = get_user_id_from_payload(payload)
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный или просроченный refresh-токен",
        ) from None

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт деактивирован",
        )

    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)

    return AuthTokensResponse(
        message="Token refreshed",
        token=access_token,
        refresh_token=new_refresh_token,
    )
