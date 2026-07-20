import logging
from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jwt.exceptions import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.rate_limit import limiter
from core.settings import settings
from dependencies.auth import get_access_token_string
from dependencies.database import get_db
from enums.user import UserRole
from models.user import User
from schemas.auth import (
    AdminLoginRequest,
    AuthTokensResponse,
    BloggerLoginRequest,
    PlatformAuthorizeRequest,
    PlatformAuthorizeResponse,
    PlatformExchangeRequest,
    RefreshRequest,
    TelegramAuthExchangeRequest,
    TelegramOAuthConfigResponse,
    TelegramSubscriptionRecheckRequest,
)
from services.session_service import (
    assert_login_allowed_for_ip,
    assert_referral_registration_allowed_for_ip,
    assert_registration_allowed_for_ip,
    record_user_session,
)
from services.telegram_oauth_client import (
    TelegramOAuthError,
    exchange_code,
    verify_id_token,
)
from services.telegram_oauth_store import (
    consume_exchange_ticket,
    create_exchange_ticket,
    create_recheck_token,
    create_signed_state,
    verify_recheck_token,
    verify_signed_state,
)
from services.telegram_user_service import find_or_create_worker_by_telegram, find_or_create_client_by_telegram
from services.telegram_channel_service import (
    check_user_subscribed,
    get_channel_config,
    record_subscription,
)
from services.marketplace_referral_service import resolve_referral
from utils.account_status import account_blocked_detail
from utils.blogger_credentials import normalize_blogger_nickname
from utils.request_ip import get_client_ip
from utils.jwt_tokens import (
    create_access_token,
    create_refresh_token,
    get_user_id_from_payload,
    verify_access_token,
    verify_refresh_token,
)
from utils.security import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _telegram_redirect_uri() -> str:
    """Где Telegram OAuth возвращает code. Должно совпадать с настройками в BotFather."""
    base = settings.telegram_oauth_redirect_uri.strip()
    if not base:
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_OAUTH_REDIRECT_URI не настроен на сервере",
        )
    return base


def _frontend_callback_url() -> str:
    base = settings.telegram_oauth_frontend_callback_url.strip()
    if not base:
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_OAUTH_FRONTEND_CALLBACK_URL не настроен на сервере",
        )
    return base


def _frontend_redirect(*, ticket: str | None = None, error: str | None = None) -> RedirectResponse:
    target = _frontend_callback_url()
    params: dict[str, str] = {}
    if ticket is not None:
        params["exchange"] = ticket
    if error is not None:
        params["error"] = error
    if params:
        target = f"{target}?{urlencode(params)}"
    return RedirectResponse(target, status_code=302)


@router.get("/telegram/config", response_model=TelegramOAuthConfigResponse)
async def telegram_oauth_config():
    """Сообщает фронту, можно ли показывать кнопку «Войти через Telegram»."""
    if not settings.telegram_oauth_ready:
        return TelegramOAuthConfigResponse(enabled=False, bot_username=None)
    bot_username = settings.telegram_oauth_bot_username.strip().lstrip("@") or None
    return TelegramOAuthConfigResponse(enabled=True, bot_username=bot_username)


@router.get("/telegram/start")
@limiter.limit(settings.rate_limit_login)
async def telegram_oauth_start(
    request: Request,
    linked_to: str | None = Query(default=None),
    role: str = Query(default="WORKER"),
    db: AsyncSession = Depends(get_db),
):
    """Top-level redirect на authorization endpoint Telegram OAuth.

    Регистрационный лимит здесь же — авторизация может закончиться
    созданием воркера.
    """
    if not settings.telegram_oauth_ready:
        raise HTTPException(status_code=503, detail="Telegram-вход не настроен на сервере")

    client_ip = get_client_ip(request)

    try:
        await assert_registration_allowed_for_ip(db, client_ip)
    except HTTPException:
        raise
    except Exception:
        logger.warning("Telegram start: ошибка проверки IP %r, пропускаем лимит", client_ip)

    if linked_to is not None and role == "WORKER":
        try:
            worker_linked_uuid = UUID(linked_to)
        except ValueError:
            worker_linked_uuid = None
        if worker_linked_uuid:
            ref_user = await db.get(User, worker_linked_uuid)
            if ref_user is None or ref_user.role != UserRole.BLOGER:
                raise HTTPException(
                    status_code=400,
                    detail="Некорректный linked_to: нужен существующий блогер",
                )
            try:
                await assert_referral_registration_allowed_for_ip(db, client_ip, worker_linked_uuid)
            except HTTPException:
                raise
            except Exception:
                logger.warning("Telegram start: ошибка проверки реферального лимита IP %r", client_ip)

    state = create_signed_state(
        linked_to=str(linked_to) if linked_to else None,
        client_ip=client_ip,
        role=role,
    )
    redirect_uri = _telegram_redirect_uri()

    auth_url = (
        f"{settings.telegram_oauth_issuer.rstrip('/')}/auth?"
        + urlencode(
            {
                "response_type": "code",
                "client_id": settings.telegram_oauth_client_id,
                "redirect_uri": redirect_uri,
                "scope": "openid profile",
                "state": state.state,
                "nonce": state.nonce,
            }
        )
    )
    return RedirectResponse(auth_url, status_code=302)


class _TelegramAccountError(Exception):
    """Бизнес-ошибка завершения Telegram-входа; ``code`` — код для фронта."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


async def _resolve_telegram_user(
    db: AsyncSession,
    *,
    role: str,
    linked_to: str | None,
    telegram_id: str,
    username: str,
    name: str,
) -> User:
    """Находит/создаёт пользователя после подтверждённого Telegram-входа.

    Общая часть callback'а и повторной проверки подписки (/telegram/recheck).
    """
    linked_to_uuid: UUID | None = None
    if linked_to and role == "WORKER":
        try:
            linked_to_uuid = UUID(linked_to)
        except (TypeError, ValueError):
            linked_to_uuid = None

    try:
        if role == "CLIENT":
            client_referred_by: UUID | None = None
            if linked_to:
                client_referred_by = await resolve_referral(linked_to, db)

            user = await find_or_create_client_by_telegram(
                db,
                telegram_id=telegram_id,
                username=username,
                name=name,
                marketplace_referred_by=client_referred_by,
            )
        else:
            user = await find_or_create_worker_by_telegram(
                db,
                telegram_id=telegram_id,
                username=username,
                name=name,
                linked_to=linked_to_uuid,
            )
    except Exception:
        logger.exception("Telegram: ошибка создания/поиска пользователя tg_id=%s", telegram_id)
        await db.rollback()
        raise _TelegramAccountError("account_error")

    if not user.is_active:
        raise _TelegramAccountError("user_disabled")
    if role == "WORKER" and user.role != UserRole.WORKER:
        raise _TelegramAccountError("not_worker")
    if role == "CLIENT" and user.role != UserRole.CLIENT:
        raise _TelegramAccountError("not_client")
    return user


@router.get("/telegram/callback")
async def telegram_oauth_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Принимает redirect от Telegram OAuth, выпускает одноразовый ticket.

    Дальше фронт обменивает ``ticket`` на JWT-пары через ``/exchange``.
    """
    if error:
        return _frontend_redirect(error=error)
    if not code or not state:
        return _frontend_redirect(error="missing_code_or_state")

    state_entry = verify_signed_state(state)
    if state_entry is None:
        return _frontend_redirect(error="state_expired")

    redirect_uri = settings.telegram_oauth_redirect_uri.strip()
    if not redirect_uri:
        return _frontend_redirect(error="server_misconfigured")

    try:
        id_token = await exchange_code(code=code, redirect_uri=redirect_uri)
        claims = await verify_id_token(id_token=id_token, expected_nonce=state_entry.nonce)
    except TelegramOAuthError as exc:
        return _frontend_redirect(error=str(exc))

    # ─── Mandatory channel subscription check ───────────────────────────────
    channel_config = await get_channel_config(db)
    if channel_config is not None and channel_config.is_enabled:
        # Bot API понимает только клейм ``id`` (числовой user id); sub — опаковое
        # пространство OAuth-шлюза, getChatMember по нему всегда «не подписан».
        check_id = claims.bot_api_id or str(claims.sub)
        if claims.bot_api_id is None:
            logger.warning(
                "id claim missing in id_token for sub=%s — subscription check "
                "falls back to sub and will most likely fail", claims.sub,
            )
        subscribed = await check_user_subscribed(check_id, channel_config.channel_id)
        if not subscribed:
            # Redirect to frontend with error + channel info for UI.
            # recheck-токен позволяет кнопке «Я подписался» завершить вход
            # без повторного прохода через Telegram OAuth.
            recheck = create_recheck_token(
                telegram_id=str(claims.sub),
                username=claims.preferred_username or "",
                name=claims.name or "",
                linked_to=state_entry.linked_to,
                client_ip=state_entry.client_ip,
                role=state_entry.role,
                check_id=check_id,
            )
            target = _frontend_callback_url()
            params = {
                "error": "channel_not_subscribed",
                "channel_url": channel_config.channel_url or "",
                "channel_title": channel_config.channel_title or "",
                "recheck": recheck,
            }
            target = f"{target}?{urlencode(params)}"
            return RedirectResponse(target, status_code=302)
        # Record subscription for analytics
        client_ip = state_entry.client_ip if hasattr(state_entry, "client_ip") else None
        await record_subscription(db, check_id, channel_config.channel_id, client_ip)
        await db.commit()

    try:
        user = await _resolve_telegram_user(
            db,
            role=state_entry.role,
            linked_to=state_entry.linked_to,
            telegram_id=str(claims.sub),
            username=claims.preferred_username,
            name=claims.name,
        )
    except _TelegramAccountError as exc:
        return _frontend_redirect(error=exc.code)

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    ticket = await create_exchange_ticket(access_token=access, refresh_token=refresh)
    return _frontend_redirect(ticket=ticket.ticket)


@router.post("/telegram/exchange", response_model=AuthTokensResponse)
@limiter.limit(settings.rate_limit_login)
async def telegram_oauth_exchange(
    request: Request,
    body: TelegramAuthExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обменивает одноразовый ticket из URL фронта на пару JWT."""
    entry = await consume_exchange_ticket(body.ticket)
    if entry is None:
        raise HTTPException(status_code=404, detail="Ticket уже использован или истёк")

    client_ip = get_client_ip(request)

    # Запись сессии и rate-limit на IP — best-effort: вход уже успешен,
    # ошибки журнала не должны блокировать выдачу токенов.
    try:
        payload = verify_access_token(entry.access_token)
        user_id = get_user_id_from_payload(payload)
    except PyJWTError:
        user_id = None

    if user_id is not None:
        try:
            await assert_login_allowed_for_ip(db, client_ip)
            await record_user_session(
                db,
                client_ip,
                request.headers.get("user-agent", ""),
                user_id=user_id,
                session_kind="login",
            )
        except HTTPException:
            # rate-limit/401: не валим выдачу токенов — это уже подтверждённый OIDC-вход
            pass
        except Exception:  # pragma: no cover
            pass

    return AuthTokensResponse(
        message="Login successful",
        token=entry.access_token,
        refresh_token=entry.refresh_token,
    )


@router.post("/telegram/recheck", response_model=AuthTokensResponse)
@limiter.limit(settings.rate_limit_login)
async def telegram_subscription_recheck(
    request: Request,
    body: TelegramSubscriptionRecheckRequest,
    db: AsyncSession = Depends(get_db),
):
    """Повторная проверка подписки на канал без нового прохода Telegram OAuth.

    Кнопка «Я подписался» шлёт recheck-токен из callback-редиректа; claims в
    нём уже подтверждены OIDC-обменом. Если подписка появилась — сразу выдаём
    JWT-пары. 409 — подписки всё ещё нет; 410 — токен истёк, нужен полный
    заход через Telegram.
    """
    entry = verify_recheck_token(body.token)
    if entry is None:
        raise HTTPException(status_code=410, detail="recheck_expired")

    channel_config = await get_channel_config(db)
    if channel_config is not None and channel_config.is_enabled:
        # check_id = клейм ``id`` (Bot API user id); entry.telegram_id (sub)
        # остаётся ключом аккаунта и для getChatMember непригоден.
        subscribed = await check_user_subscribed(entry.check_id, channel_config.channel_id)
        if not subscribed:
            raise HTTPException(status_code=409, detail="still_not_subscribed")
        await record_subscription(
            db, entry.check_id, channel_config.channel_id, entry.client_ip or None
        )
        await db.commit()

    try:
        user = await _resolve_telegram_user(
            db,
            role=entry.role,
            linked_to=entry.linked_to,
            telegram_id=entry.telegram_id,
            username=entry.username,
            name=entry.name,
        )
    except _TelegramAccountError as exc:
        raise HTTPException(status_code=403, detail=exc.code)

    # Журнал сессии — best-effort, вход уже подтверждён.
    try:
        await record_user_session(
            db,
            get_client_ip(request),
            request.headers.get("user-agent", ""),
            user_id=user.id,
            session_kind="login",
        )
    except Exception:  # pragma: no cover
        pass

    return AuthTokensResponse(
        message="Login successful",
        token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


# ---------------------------------------------------------------------------
# Platform SSO (OAuth-подобный обмен) — вход блогера в маркетплейс
# ---------------------------------------------------------------------------


def _validate_marketplace_redirect(redirect_uri: str) -> str:
    """Разрешаем redirect только на фронт маркетплейса (или localhost в dev)."""
    from urllib.parse import urlparse

    candidate = redirect_uri.strip()
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Некорректный redirect_uri")

    allowed_origins: set[str] = set()
    mp = urlparse(settings.marketplace_frontend_url.strip())
    if mp.scheme and mp.netloc:
        allowed_origins.add(f"{mp.scheme}://{mp.netloc}".lower())
    # Dev-режим: локальные адреса
    if settings.app_env != "production":
        for host in ("localhost", "127.0.0.1"):
            for port in ("3000", "3001", "3002"):
                allowed_origins.add(f"http://{host}:{port}")

    origin = f"{parsed.scheme}://{parsed.netloc}".lower()
    if origin not in allowed_origins:
        raise HTTPException(
            status_code=400,
            detail="redirect_uri не входит в список разрешённых адресов маркетплейса",
        )
    return candidate


@router.post("/platform/authorize", response_model=PlatformAuthorizeResponse)
@limiter.limit(settings.rate_limit_login)
async def platform_oauth_authorize(
    request: Request,
    body: PlatformAuthorizeRequest,
    db: AsyncSession = Depends(get_db),
    token: str = Depends(get_access_token_string),
):
    """Выдаёт одноразовый код для SSO-входа блогера в маркетплейс.

    Вызывается фронтом главной платформы от имени залогиненного блогера.
    Код обменивается маркетплейсом на JWT-пару через /auth/platform/exchange.
    """
    try:
        payload = verify_access_token(token)
        user_id = get_user_id_from_payload(payload)
    except PyJWTError:
        raise HTTPException(status_code=401, detail="Невалидный access-токен") from None

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    if not user.is_active:
        raise HTTPException(status_code=401, detail=account_blocked_detail(user))
    if user.role != UserRole.BLOGER:
        raise HTTPException(
            status_code=403,
            detail="SSO-вход в маркетплейс доступен только блогерам",
        )

    redirect_uri = _validate_marketplace_redirect(body.redirect_uri)

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    ticket = await create_exchange_ticket(access_token=access, refresh_token=refresh)

    return PlatformAuthorizeResponse(code=ticket.ticket, redirect_uri=redirect_uri)


@router.post("/platform/exchange", response_model=AuthTokensResponse)
@limiter.limit(settings.rate_limit_login)
async def platform_oauth_exchange(
    request: Request,
    body: PlatformExchangeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Обменивает одноразовый код SSO на пару JWT (вызывается фронтом маркетплейса)."""
    entry = await consume_exchange_ticket(body.code)
    if entry is None:
        raise HTTPException(status_code=404, detail="Код уже использован или истёк")

    client_ip = get_client_ip(request)
    try:
        payload = verify_access_token(entry.access_token)
        user_id = get_user_id_from_payload(payload)
    except PyJWTError:
        user_id = None

    if user_id is not None:
        try:
            await record_user_session(
                db,
                client_ip,
                request.headers.get("user-agent", ""),
                user_id=user_id,
                session_kind="login",
            )
        except Exception:  # pragma: no cover
            pass

    return AuthTokensResponse(
        message="Login successful",
        token=entry.access_token,
        refresh_token=entry.refresh_token,
    )


@router.post("/admin-login")
@limiter.limit(settings.rate_limit_login)
async def admin_login(
    request: Request,
    body: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Вход администратора по email/паролю — единственный «классический» логин."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hash_pass):
        raise HTTPException(status_code=400, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail=account_blocked_detail(user))
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Этот вход доступен только администратору")
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
        raise HTTPException(status_code=401, detail=account_blocked_detail(user))
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
