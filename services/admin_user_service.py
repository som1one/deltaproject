import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.ledger_entry import LedgerEntry
from models.referral import ReferralLink
from models.user import User
from schemas.admin import (
    AdminBloggerCreateRequest,
    AdminBloggerCabinetStatsRead,
    AdminUserStatsResponse,
    AdminWorkerCabinetStatsRead,
    AdminUserPatch,
)
from services.admin_audit_service import record_admin_audit
from services.ledger_service import _reserved_payout_kopeks, sum_pending_confirmation_kopeks
from services.me_service import get_or_create_blogger_stat, get_or_create_worker_stat
from utils.blogger_credentials import (
    build_blogger_internal_email,
    generate_blogger_password,
    normalize_blogger_nickname,
)
from utils.card_hash import compute_card_hash_and_last4, luhn_ok, normalize_pan
from utils.security import hash_password


_ADMIN_ROLES = (UserRole.ADMIN, UserRole.TECH_ADMIN)
_MAX_TECH_ADMINS = 10


async def _count_active_admins(db: AsyncSession, *, exclude_id: uuid.UUID | None = None) -> int:
    """Число активных учётных записей-владельцев с ролью Admin.

    При указании ``exclude_id`` соответствующий пользователь исключается из подсчёта —
    это позволяет проверить, останется ли хотя бы один активный Admin после
    деактивации/удаления/понижения роли конкретного пользователя (Req 5.7).
    """
    stmt = select(func.count(User.id)).where(
        User.role == UserRole.ADMIN,
        User.is_active.is_(True),
    )
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return int((await db.execute(stmt)).scalar_one())


async def _count_tech_admins(db: AsyncSession, *, exclude_id: uuid.UUID | None = None) -> int:
    """Число учётных записей с ролью Tech_Admin (для лимита 0..10, Req 5.1)."""
    stmt = select(func.count(User.id)).where(User.role == UserRole.TECH_ADMIN)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return int((await db.execute(stmt)).scalar_one())


async def admin_list_users(
    db: AsyncSession,
    *,
    role: UserRole | None,
    email: str | None,
    linked_to: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[User], int]:
    base = select(User)
    count_stmt = select(func.count(User.id))

    if role is not None:
        base = base.where(User.role == role)
        count_stmt = count_stmt.where(User.role == role)
    if email is not None and email.strip():
        email_q = email.strip().lower()
        matcher = or_(
            func.lower(User.email).like(f"%{email_q}%"),
            func.lower(func.coalesce(User.nickname, "")).like(f"%{email_q}%"),
        )
        base = base.where(matcher)
        count_stmt = count_stmt.where(matcher)
    if linked_to is not None:
        base = base.where(User.linked_to == linked_to)
        count_stmt = count_stmt.where(User.linked_to == linked_to)

    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(base.order_by(User.id.asc()).limit(limit).offset(offset))
    ).scalars().all()
    return list(rows), total


async def admin_get_user(user_id: uuid.UUID, db: AsyncSession) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user


async def admin_patch_user(
    user_id: uuid.UUID,
    body: AdminUserPatch,
    current_admin: User,
    db: AsyncSession,
) -> User:
    user = await admin_get_user(user_id, db)
    target_role = body.role if body.role is not None else user.role

    # Разграничение прав (Req 5.5, 5.8): операции над административными аккаунтами
    # (смена роли, активность) и назначение административной роли доступны только
    # актору с ролью Admin. Тех-админ такие операции выполнять не может.
    role_change = body.role is not None and body.role != user.role
    becoming_admin_role = (
        body.role is not None and body.role in _ADMIN_ROLES and body.role != user.role
    )
    if current_admin.role != UserRole.ADMIN:
        if user.role in _ADMIN_ROLES and (role_change or body.is_active is not None):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Управление административными учётными записями доступно только владельцу-Admin",
            )
        if becoming_admin_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Назначение административной роли доступно только владельцу-Admin",
            )

    if body.email is not None:
        email_value = str(body.email).strip().lower()
        conflict = await db.execute(
            select(User).where(User.email == email_value, User.id != user.id),
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email уже занят")
        user.email = email_value
    if body.telegram is not None:
        user.telegram = body.telegram
    if body.name is not None:
        user.name = body.name
    if body.nickname is not None:
        if target_role != UserRole.BLOGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ник задаётся только для роли блогера",
            )
        try:
            nickname_value = normalize_blogger_nickname(body.nickname)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        conflict = await db.execute(
            select(User).where(User.nickname == nickname_value, User.id != user.id),
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ник уже занят")
        user.nickname = nickname_value
        user.email = build_blogger_internal_email(nickname_value)
    if body.percent is not None:
        new_percent = round(float(body.percent), 2)
        if user.percent != new_percent:
            old_percent = user.percent
            user.percent = new_percent
            await record_admin_audit(
                db,
                actor_id=current_admin.id,
                target_user_id=user.id,
                field="percent",
                old_value=str(old_percent),
                new_value=str(new_percent),
            )
    if body.upline_blogger_id is not None:
        # Назначение наставника-блогера (аплайна). Валидация (Req 7.1): целевой
        # пользователь и указанный наставник — оба Bloger, наставник != сам пользователь.
        if body.upline_blogger_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь не может быть собственным наставником",
            )
        if target_role != UserRole.BLOGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Наставник-аплайн назначается только пользователю с ролью блогер",
            )
        upline = await db.get(User, body.upline_blogger_id)
        if upline is None or upline.role != UserRole.BLOGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Наставник должен существовать и иметь роль блогер",
            )
        if user.upline_blogger_id != body.upline_blogger_id:
            old_upline = user.upline_blogger_id
            user.upline_blogger_id = body.upline_blogger_id
            await record_admin_audit(
                db,
                actor_id=current_admin.id,
                target_user_id=user.id,
                field="upline_blogger_id",
                old_value=str(old_upline) if old_upline is not None else None,
                new_value=str(body.upline_blogger_id),
            )
    if body.is_active is not None:
        if user.id == current_admin.id and body.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нельзя деактивировать текущего администратора",
            )
        # Защита последнего владельца (Req 5.7): деактивация Admin не должна оставить 0 активных Admin.
        if (
            body.is_active is False
            and user.role == UserRole.ADMIN
            and user.is_active
            and await _count_active_admins(db, exclude_id=user.id) == 0
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Нельзя деактивировать единственного активного администратора",
            )
        user.is_active = bool(body.is_active)
    if body.role is not None and body.role != user.role:
        if body.role == UserRole.ADMIN:
            existing_admin = await db.execute(
                select(User).where(User.role == UserRole.ADMIN, User.id != user.id),
            )
            if existing_admin.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Администратор уже существует",
                )
        if body.role == UserRole.TECH_ADMIN:
            # Лимит 0..10 тех-админов (Req 5.1).
            if await _count_tech_admins(db, exclude_id=user.id) >= _MAX_TECH_ADMINS:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Достигнут лимит учётных записей Tech_Admin (максимум 10)",
                )
        if user.role == UserRole.ADMIN and body.role != UserRole.ADMIN:
            # Защита последнего владельца (Req 5.7): понижение роли единственного
            # активного Admin запрещено.
            if user.is_active and await _count_active_admins(db, exclude_id=user.id) == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Нельзя понизить роль единственного администратора",
                )
        user.role = body.role

    if body.blogger_cabinet_pin is not None:
        if user.role != UserRole.BLOGER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="PIN кабинета задаётся только для роли блогер",
            )
        if body.blogger_cabinet_pin == "":
            user.blogger_cabinet_pin_hash = None
            user.blogger_cabinet_pin_set_at = None
        else:
            user.blogger_cabinet_pin_hash = hash_password(body.blogger_cabinet_pin)
            user.blogger_cabinet_pin_set_at = datetime.now(UTC)

    if body.new_password is not None:
        user.hash_pass = hash_password(body.new_password)

    await db.commit()
    await db.refresh(user)
    return user


async def admin_create_blogger(
    body: AdminBloggerCreateRequest,
    db: AsyncSession,
) -> tuple[User, str]:
    try:
        nickname = normalize_blogger_nickname(body.nickname)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    conflict = await db.execute(select(User).where(User.nickname == nickname))
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ник уже занят")

    display_name = body.name.strip() if body.name and body.name.strip() else nickname
    telegram = body.telegram.strip() if body.telegram and body.telegram.strip() else None
    password = generate_blogger_password()
    user = User(
        name=display_name,
        email=build_blogger_internal_email(nickname),
        nickname=nickname,
        telegram=telegram,
        hash_pass=hash_password(password),
        role=UserRole.BLOGER,
    )
    db.add(user)
    await db.flush()

    # Сразу создаём реферальную ссылку, чтобы новый блогер видел её в кабинете.
    db.add(ReferralLink(user_id=user.id, link=f"/ref/{nickname}"))
    await db.commit()
    await db.refresh(user)
    return user, password


async def admin_get_user_stats(user_id: uuid.UUID, db: AsyncSession) -> AdminUserStatsResponse:
    user = await admin_get_user(user_id, db)
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Статистика кабинета для роли администратора не предусмотрена",
        )
    pending = await sum_pending_confirmation_kopeks(user.id, db)
    if user.role == UserRole.WORKER:
        row = await get_or_create_worker_stat(user.id, db)
        return AdminWorkerCabinetStatsRead(
            deals=row.deals,
            agree=row.agree,
            paid=row.paid,
            earn=row.earn,
            balance_pending_confirmation_kopeks=pending,
        )
    if user.role == UserRole.BLOGER:
        row = await get_or_create_blogger_stat(user.id, db)
        return AdminBloggerCabinetStatsRead(
            deals=row.deals,
            earn=row.earn,
            workers=row.workers,
            balance_pending_confirmation_kopeks=pending,
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Неизвестная роль",
    )


async def admin_get_user_ledger(
    user_id: uuid.UUID,
    db: AsyncSession,
    *,
    limit: int,
    offset: int,
    status_filter: LedgerEntryStatus | None,
) -> tuple[list[LedgerEntry], int]:
    await admin_get_user(user_id, db)
    stmt = select(LedgerEntry).where(LedgerEntry.user_id == user_id)
    count_stmt = select(func.count(LedgerEntry.id)).where(LedgerEntry.user_id == user_id)
    if status_filter is not None:
        stmt = stmt.where(LedgerEntry.status == status_filter)
        count_stmt = count_stmt.where(LedgerEntry.status == status_filter)
    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(stmt.order_by(LedgerEntry.created_at.desc()).limit(limit).offset(offset))
    ).scalars().all()
    return list(rows), total


async def admin_delete_user(
    user_id: uuid.UUID,
    current_admin: User,
    db: AsyncSession,
) -> None:
    user = await admin_get_user(user_id, db)
    if user.id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить текущего администратора",
        )
    # Разграничение прав (Req 5.5, 5.8): удалять административные аккаунты
    # (Admin/Tech_Admin) может только владелец-Admin.
    if user.role in _ADMIN_ROLES and current_admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Удаление административных учётных записей доступно только владельцу-Admin",
        )
    # Защита последнего владельца (Req 5.7): удаление не должно оставить 0 активных Admin.
    if user.role == UserRole.ADMIN and await _count_active_admins(db, exclude_id=user.id) == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя удалить единственного администратора",
        )
    await db.delete(user)
    await db.commit()


async def admin_adjust_user_balance(
    user_id: uuid.UUID,
    amount_kopeks: int,
    reason: str,
    actor: User,
    db: AsyncSession,
) -> tuple[User, LedgerEntry]:
    """Атомарная ручная корректировка баланса пользователя (Req 3).

    Выполняется в одной транзакции: строка пользователя блокируется
    ``with_for_update``; при уменьшении баланса проверяется, что итог не опускается
    ниже суммы зарезервированных средств (активные выплаты/заморозка). Создаётся
    запись журнала в статусе ``completed`` и запись аудита с идентификатором актора.
    При любой ошибке (включая сбой записи журнала/аудита) транзакция откатывается
    целиком и исходный баланс сохраняется (Req 3.9) — исключения пробрасываются,
    rollback гарантируется контекстом сессии.

    Валидация суммы и причины (диапазон, ноль, длина/пробелы) обеспечивается схемой
    ``AdminBalanceAdjustmentRequest`` на уровне эндпоинта.

    Args:
        user_id: Идентификатор пользователя, чей баланс корректируется.
        amount_kopeks: Сумма корректировки в копейках (может быть отрицательной).
        reason: Причина корректировки (непустая, ≤ 500 символов).
        actor: Администратор, выполняющий операцию.
        db: Асинхронная сессия БД.

    Returns:
        Кортеж ``(user, ledger_entry)`` после фиксации транзакции.

    Raises:
        HTTPException: 404 — пользователь не найден; 400 — недостаточно доступных
            средств при уменьшении баланса (Req 3.5).
    """
    user = (
        await db.execute(select(User).where(User.id == user_id).with_for_update())
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    old_balance = user.balance
    new_balance = user.balance + amount_kopeks

    if amount_kopeks < 0:
        reserved = await _reserved_payout_kopeks(user_id, db)
        if new_balance < reserved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Недостаточно доступных средств: итоговый баланс ниже суммы "
                    "зарезервированных средств (активные выплаты и заморозка)"
                ),
            )

    user.balance = new_balance

    entry = LedgerEntry(
        user_id=user_id,
        deal_id=None,
        amount_kopeks=amount_kopeks,
        status=LedgerEntryStatus.COMPLETED,
        note=reason.strip(),
        idempotency_key=f"adj:{uuid.uuid4()}",
    )
    db.add(entry)

    await record_admin_audit(
        db,
        actor_id=actor.id,
        target_user_id=user_id,
        field="balance_adjustment",
        old_value=str(old_balance),
        new_value=str(new_balance),
    )

    await db.commit()
    await db.refresh(user)
    await db.refresh(entry)
    return user, entry


async def admin_set_partner_card(
    user_id: uuid.UUID,
    card_number: str,
    card_brand: str | None,
    card_holder: str | None,
    actor: User,
    db: AsyncSession,
    card_bank: str | None = None,
) -> User:
    """Установить карту выплаты партнёра администратором (Req 5.3, 5.6, 5.10).

    Порядок проверок согласован с ``set_me_payout_card``: наличие секрета
    хеширования (``503``) → длина 13–19 цифр (``400``) → алгоритм Луна (``400``) →
    сохранение хеша и last4. Полный PAN в БД не сохраняется. Изменение фиксируется
    в аудите (``field='payout_card'``) только в маскированном виде (last4).

    Args:
        user_id: Идентификатор партнёра, которому задаётся карта.
        card_number: Номер карты (нормализуется; PAN не сохраняется).
        actor: Администратор, выполняющий операцию.
        db: Асинхронная сессия БД.

    Returns:
        Обновлённый пользователь.

    Raises:
        HTTPException: 404 — пользователь не найден; 503 — не задан секрет
            хеширования; 400 — недопустимая длина или номер карты.
    """
    user = await admin_get_user(user_id, db)

    pepper = settings.payout_card_pepper.strip()
    if not pepper:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сохранение реквизитов карты отключено: не задан PAYOUT_CARD_PEPPER",
        )
    pan = normalize_pan(card_number)
    if len(pan) < 13 or len(pan) > 19:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректная длина номера карты",
        )
    if not luhn_ok(pan):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некорректный номер карты",
        )

    old_last4 = user.payout_card_last4
    card_hash, new_last4 = compute_card_hash_and_last4(pan, pepper)
    user.payout_card_hash = card_hash
    user.payout_card_last4 = new_last4
    user.payout_card_brand = card_brand
    user.payout_card_holder = card_holder
    user.payout_card_bank = card_bank

    await record_admin_audit(
        db,
        actor_id=actor.id,
        target_user_id=user_id,
        field="payout_card",
        old_value=f"****{old_last4}" if old_last4 else None,
        new_value=f"****{new_last4}",
    )

    await db.commit()
    await db.refresh(user)
    return user
