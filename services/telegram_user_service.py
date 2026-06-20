"""Поиск/создание воркера по Telegram-аккаунту.

Отделено от роутеров и от OAuth-клиента, чтобы оставаться
переиспользуемым между разными flow (OIDC, виджет и т. п.).
"""
from __future__ import annotations

import secrets
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from enums.user import UserRole
from models.user import User
from schemas.auth import RegisterRequest
from services.auth_service import create_user
from services.marketplace_referral_service import assign_referral


def telegram_worker_email(telegram_id: str) -> str:
    return f"tg_{telegram_id}@telegram.example.com"

def telegram_client_email(telegram_id: str) -> str:
    return f"tg_client_{telegram_id}@telegram.example.com"


def _legacy_worker_email_by_username(username: str) -> str:
    return f"tg_{username}@telegram.example.com"


async def find_or_create_worker_by_telegram(
    session: AsyncSession,
    *,
    telegram_id: str,
    username: str,
    name: str,
    linked_to: UUID | None,
) -> User:
    """Возвращает воркера для данного Telegram ID, создавая при необходимости.

    `username` — без префикса ``@``, нижнем регистре. ``linked_to``
    проверяется на существование блогера; некорректное значение
    игнорируется.
    """
    telegram_handle = f"@{username}" if username else None

    # 1) основной поиск по синтетическому email с telegram_id
    result = await session.execute(
        select(User).where(User.email == telegram_worker_email(telegram_id))
    )
    user: User | None = result.scalar_one_or_none()

    # 2) legacy: email по username
    if user is None and username:
        result = await session.execute(
            select(User).where(User.email == _legacy_worker_email_by_username(username))
        )
        user = result.scalar_one_or_none()

    # 3) legacy: по полю telegram (`@username`)
    if user is None and telegram_handle:
        result = await session.execute(
            select(User).where(User.telegram == telegram_handle)
        )
        user = result.scalars().first()

    if user is not None:
        changed = False
        if telegram_handle and user.telegram != telegram_handle:
            user.telegram = telegram_handle
            changed = True
        canonical_email = telegram_worker_email(telegram_id)
        if user.email != canonical_email:
            user.email = canonical_email
            changed = True
        if changed:
            try:
                await session.commit()
                await session.refresh(user)
            except IntegrityError:
                await session.rollback()
                # Another user already has this canonical email — refetch by email
                result = await session.execute(
                    select(User).where(User.email == telegram_worker_email(telegram_id))
                )
                user = result.scalar_one_or_none()
                if user is None:
                    raise
        return user

    validated_linked_to: UUID | None = None
    if linked_to is not None:
        ref_user = await session.get(User, linked_to)
        if ref_user is not None and ref_user.role == UserRole.BLOGER:
            validated_linked_to = linked_to

    try:
        user = await create_user(
            RegisterRequest(
                name=name,
                email=telegram_worker_email(telegram_id),
                telegram=telegram_handle,
                password=secrets.token_urlsafe(24),
                role=UserRole.WORKER,
                linked_to=validated_linked_to,
            ),
            session,
        )
    except IntegrityError:
        await session.rollback()
        # Concurrent registration — user was just created by another request
        result = await session.execute(
            select(User).where(User.email == telegram_worker_email(telegram_id))
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise
    return user


async def find_or_create_client_by_telegram(
    session: AsyncSession,
    *,
    telegram_id: str,
    username: str,
    name: str,
    marketplace_referred_by: UUID | None,
) -> User:
    telegram_handle = f"@{username}" if username else None

    # Search by exact email
    result = await session.execute(
        select(User).where(User.email == telegram_client_email(telegram_id))
    )
    user: User | None = result.scalar_one_or_none()

    if user is not None:
        changed = False
        if telegram_handle and user.telegram != telegram_handle:
            user.telegram = telegram_handle
            changed = True
        if changed:
            await session.commit()
            await session.refresh(user)
        return user

    # Create new client
    validated_referred_by: UUID | None = None
    if marketplace_referred_by is not None:
        ref_user = await session.get(User, marketplace_referred_by)
        if ref_user is not None and ref_user.role == UserRole.WORKER:
            validated_referred_by = marketplace_referred_by

    user = User(
        name=name,
        email=telegram_client_email(telegram_id),
        telegram=telegram_handle,
        hash_pass=secrets.token_urlsafe(24),  # No raw password access needed
        role=UserRole.CLIENT,
        is_active=True,
        marketplace_referred_by=None,
    )
    session.add(user)
    try:
        await session.flush()
        await session.refresh(user)
        # Assign referral using immutable service (Requirement 6.1, 6.3)
        if validated_referred_by is not None:
            await assign_referral(user.id, validated_referred_by, session)
            await session.refresh(user)
        await session.commit()
        await session.refresh(user)
    except IntegrityError:
        await session.rollback()
        # Concurrent creation — fetch the just-created user
        result = await session.execute(
            select(User).where(User.email == telegram_client_email(telegram_id))
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise
    return user
