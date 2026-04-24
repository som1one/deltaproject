import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import limiter
from core.settings import settings
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.auth import (
    AuthTokensResponse,
    BloggerLoginRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TelegramOAuthCodeExchangeRequest,
    TelegramOAuthCodeExchangeResponse,
    TelegramWorkerLoginRequest,
    TelegramWorkerRegisterRequest,
)
from schemas.auth import (
    TelegramOAuthConfigResponse,
    TelegramOAuthVerifyRequest,
    TelegramOAuthVerifyResponse,
)
from services.auth_service import create_user
from services.session_service import (
    assert_login_allowed_for_ip,
    assert_referral_registration_allowed_for_ip,
    assert_registration_allowed_for_ip,
    record_user_session,
)
from utils.blogger_credentials import normalize_blogger_nickname
from utils.request_ip import get_client_ip
from utils.telegram_oauth import (
    exchange_telegram_oauth_code,
    verify_telegram_oauth_id_token,
)
from utils.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_payload,
    verify_access_token,
    verify_refresh_token,
)
from utils.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _telegram_worker_email(telegram_id: int) -> str:
    return f"tg_{telegram_id}@telegram.example.com"


def _telegram_worker_legacy_email(username: str) -> str:
    return f"tg_{username}@telegram.example.com"


def _verify_telegram_request(
    body: TelegramOAuthVerifyRequest | TelegramWorkerLoginRequest | TelegramWorkerRegisterRequest,
) -> dict[str, object]:
    if not settings.telegram_oauth_ready:
        raise HTTPException(status_code=503, detail="Telegram OAuth не настроен на сервере")
    return verify_telegram_oauth_id_token(
        body.id_token,
        client_id=settings.telegram_oauth_client_id,
        issuer=settings.telegram_oauth_issuer,
        jwks_url=settings.telegram_oauth_jwks_url,
    )


async def _find_worker_for_telegram(
    db: AsyncSession,
    telegram_id: int,
    username: str,
    telegram: str | None,
) -> User | None:
    result = await db.execute(select(User).where(User.email == _telegram_worker_email(telegram_id)))
    user = result.scalar_one_or_none()
    if user is not None:
        return user
    result = await db.execute(select(User).where(User.email == _telegram_worker_legacy_email(username)))
    user = result.scalar_one_or_none()
    if user is not None:
        return user
    if not telegram:
        return None
    result = await db.execute(select(User).where(User.telegram == telegram))
    return result.scalars().first()


@router.get("/telegram/config", response_model=TelegramOAuthConfigResponse)
async def telegram_oauth_config():
    if not settings.telegram_oauth_ready:
        return TelegramOAuthConfigResponse(enabled=False, client_id=None)
    return TelegramOAuthConfigResponse(
        enabled=True,
        client_id=settings.telegram_oauth_client_id.strip(),
    )


@router.post("/telegram/verify", response_model=TelegramOAuthVerifyResponse)
@limiter.limit(settings.rate_limit_login)
async def verify_telegram_oauth(
    request: Request,
    body: TelegramOAuthVerifyRequest,
):
    verified = _verify_telegram_request(body)
    return TelegramOAuthVerifyResponse(**verified)


@router.post("/telegram/exchange-code", response_model=TelegramOAuthCodeExchangeResponse)
@limiter.limit(settings.rate_limit_login)
async def telegram_exchange_code(
    request: Request,
    body: TelegramOAuthCodeExchangeRequest,
):
    if not settings.telegram_oauth_ready or not settings.telegram_oauth_client_secret.strip():
        raise HTTPException(status_code=503, detail="Telegram OAuth не настроен на сервере")
    id_token = await exchange_telegram_oauth_code(
        code=body.code,
        redirect_uri=body.redirect_uri,
        code_verifier=body.code_verifier,
        client_id=settings.telegram_oauth_client_id,
        client_secret=settings.telegram_oauth_client_secret,
    )
    return TelegramOAuthCodeExchangeResponse(id_token=id_token)


@router.post("/telegram/worker-login", response_model=AuthTokensResponse)
@limiter.limit(settings.rate_limit_login)
async def telegram_worker_login(
    request: Request,
    body: TelegramWorkerLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    verified = _verify_telegram_request(body)
    telegram_id = int(verified["telegram_id"])
    username = str(verified["username"])
    telegram = str(verified["telegram"]) if verified.get("telegram") else None
    user = await _find_worker_for_telegram(db, telegram_id, username, telegram)
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="Аккаунт воркера не найден. Сначала зарегистрируйтесь через Telegram.",
        )
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь деактивирован")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Для администратора используйте /auth/login")
    if user.role != UserRole.WORKER:
        raise HTTPException(status_code=403, detail="Telegram OAuth вход сейчас доступен только воркеру")

    if telegram and user.telegram != telegram:
        user.telegram = telegram
        await db.commit()
        await db.refresh(user)

    client_ip = get_client_ip(request)
    await assert_login_allowed_for_ip(db, client_ip)
    await record_user_session(
        db,
        client_ip,
        request.headers.get("user-agent", ""),
        user_id=user.id,
        session_kind="login",
    )
    return AuthTokensResponse(
        message="Login successful",
        token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/telegram/worker-register", response_model=AuthTokensResponse)
@limiter.limit(settings.rate_limit_register)
async def telegram_worker_register(
    request: Request,
    body: TelegramWorkerRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    verified = _verify_telegram_request(body)
    telegram_id = int(verified["telegram_id"])
    username = str(verified["username"])
    telegram = str(verified["telegram"]) if verified.get("telegram") else None
    existing_user = await _find_worker_for_telegram(db, telegram_id, username, telegram)
    if existing_user is not None:
        if not existing_user.is_active:
            raise HTTPException(status_code=401, detail="Пользователь деактивирован")
        if existing_user.role != UserRole.WORKER:
            raise HTTPException(
                status_code=403,
                detail="Telegram OAuth регистрация доступна только для нового воркера",
            )
        if telegram and existing_user.telegram != telegram:
            existing_user.telegram = telegram
            await db.commit()
            await db.refresh(existing_user)

        client_ip = get_client_ip(request)
        await assert_login_allowed_for_ip(db, client_ip)
        await record_user_session(
            db,
            client_ip,
            request.headers.get("user-agent", ""),
            user_id=existing_user.id,
            session_kind="login",
        )
        return AuthTokensResponse(
            message="Аккаунт уже существует, вход выполнен",
            token=create_access_token(existing_user.id),
            refresh_token=create_refresh_token(existing_user.id),
        )

    client_ip = get_client_ip(request)
    await assert_registration_allowed_for_ip(db, client_ip)
    if body.linked_to is not None:
        ref_user = await db.get(User, body.linked_to)
        if ref_user is None or ref_user.role != UserRole.BLOGER:
            raise HTTPException(
                status_code=400,
                detail="Некорректный linked_to: нужен существующий пользователь с ролью блогера",
            )
        await assert_referral_registration_allowed_for_ip(db, client_ip, body.linked_to)

    user = await create_user(
        RegisterRequest(
            name=body.name.strip(),
            email=_telegram_worker_email(telegram_id),
            telegram=telegram,
            password=secrets.token_urlsafe(24),
            role=UserRole.WORKER,
            linked_to=body.linked_to,
        ),
        db,
    )
    await record_user_session(
        db,
        client_ip,
        request.headers.get("user-agent", ""),
        user_id=user.id,
        session_kind="register",
    )
    return AuthTokensResponse(
        message="User created successfully",
        token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/register")
@limiter.limit(settings.rate_limit_register)
async def register(
    request: Request,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    await assert_registration_allowed_for_ip(db, client_ip)
    if body.role != UserRole.WORKER:
        raise HTTPException(
            status_code=403,
            detail="Регистрация блогера доступна только через администратора",
        )
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
    if user.role != UserRole.WORKER:
        raise HTTPException(status_code=403, detail="Для блогера используйте вход по нику")
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


@router.post("/blogger-login")
@limiter.limit(settings.rate_limit_login)
async def blogger_login(
    request: Request,
    body: BloggerLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        nickname = normalize_blogger_nickname(body.nickname)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = await db.execute(select(User).where(User.nickname == nickname))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hash_pass):
        raise HTTPException(status_code=400, detail="Неверный ник или пароль")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Пользователь деактивирован")
    if user.role != UserRole.BLOGER:
        raise HTTPException(status_code=403, detail="Вход по нику доступен только блогеру")
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
