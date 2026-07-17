from uuid import UUID

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.deal import DealStatus
from enums.user import UserRole
from models.blogger_stat import BloggerStat
from models.deal import Deal
from models.referral import ReferralLink
from models.user import User
from models.worker_stat import WorkerStat
from schemas.me import PayoutCardSet, UserMePatch, UserMeRead, WorkerMeStatsRead
from core.settings import settings
from services.ledger_service import sum_pending_confirmation_kopeks
from utils.blogger_cabinet_unlock import (
    BLOGGER_CABINET_COOKIE_NAME,
    BLOGGER_CABINET_HEADER_NAME,
    verify_blogger_cabinet_unlock_token,
)
from utils.card_hash import compute_card_hash_and_last4, luhn_ok, normalize_pan
from utils.security import hash_password, verify_password


def _blogger_cabinet_locked(user: User, request: Request | None) -> bool:
    if user.role != UserRole.BLOGER:
        return False
    if not user.blogger_cabinet_pin_hash:
        return False
    if request is None:
        return True
    raw = request.headers.get(BLOGGER_CABINET_HEADER_NAME) or request.cookies.get(
        BLOGGER_CABINET_COOKIE_NAME,
    )
    token = (raw or "").strip()
    if token and verify_blogger_cabinet_unlock_token(token, user.id):
        return False
    return True


async def referral_invite_url(user: User, db: AsyncSession) -> str | None:
    """
    Возвращает реф-ссылку, которую разумно показать в `me`:
    - воркеру — ссылку его блогера (если он привязан);
    - блогеру — его собственную ссылку (если запись в ref_links уже есть,
      иначе соберём из nickname на лету и положим в БД, чтобы не падать
      на старых аккаунтах, созданных до автоматического создания записи).
    """
    if user.role == UserRole.WORKER:
        if user.linked_to is None:
            return None
        result = await db.execute(
            select(ReferralLink).where(ReferralLink.user_id == user.linked_to),
        )
        row = result.scalar_one_or_none()
        return row.link if row else None

    if user.role == UserRole.BLOGER:
        result = await db.execute(
            select(ReferralLink).where(ReferralLink.user_id == user.id),
        )
        row = result.scalar_one_or_none()
        if row is not None:
            return row.link
        if not user.nickname:
            return None
        # Авто-восстановление: для блогеров без ref-записи в БД создаём её.
        link = f"/ref/{user.nickname}"
        try:
            db.add(ReferralLink(user_id=user.id, link=link))
            await db.commit()
        except Exception:
            await db.rollback()
        return link

    return None


# Сохраняем старое имя для обратной совместимости.
referral_invite_url_for_worker = referral_invite_url


async def user_to_me_read(
    user: User,
    db: AsyncSession,
    request: Request | None = None,
) -> UserMeRead:
    pending = await sum_pending_confirmation_kopeks(user.id, db)
    ref_url = await referral_invite_url(user, db)
    return UserMeRead(
        id=user.id,
        name=user.name,
        email=user.email,
        nickname=user.nickname,
        telegram=user.telegram,
        photo_url=user.photo_url,
        role=user.role,
        linked_to=user.linked_to,
        percent=user.percent,
        balance=user.balance,
        balance_pending_confirmation_kopeks=pending,
        payout_card_last4=user.payout_card_last4,
        payout_card_brand=user.payout_card_brand,
        payout_card_holder=user.payout_card_holder,
        payout_card_bank=user.payout_card_bank,
        blogger_cabinet_locked=_blogger_cabinet_locked(user, request),
        referral_invite_url=ref_url,
    )


async def set_me_payout_card(user: User, body: PayoutCardSet, db: AsyncSession) -> User:
    if user.role not in (UserRole.WORKER, UserRole.BLOGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Карту для вывода могут указать только работник или блогер",
        )
    pepper = settings.payout_card_pepper.strip()
    if not pepper:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Сохранение реквизитов карты отключено: не задан PAYOUT_CARD_PEPPER",
        )
    pan = normalize_pan(body.card_number)
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
    # Присваивание происходит только после успешного прохождения всех проверок
    # (роль → секрет → длина → Луна). При любой ошибке валидации прежние
    # payout_card_hash / payout_card_last4 остаются нетронутыми (Req 4.3).
    # Сохранение не зависит от наличия токена выплаты ЮKassa (Req 4.5).
    user.payout_card_hash, user.payout_card_last4 = compute_card_hash_and_last4(pan, pepper)
    user.payout_card_brand = body.card_brand
    user.payout_card_holder = body.card_holder
    user.payout_card_bank = body.card_bank
    await db.commit()
    await db.refresh(user)
    return user


async def apply_me_patch(user: User, body: UserMePatch, db: AsyncSession) -> User:
    if body.name is not None:
        user.name = body.name
    if body.telegram is not None:
        user.telegram = body.telegram
    if body.photo_url is not None:
        user.photo_url = body.photo_url
    if body.email is not None:
        conflict = await db.execute(
            select(User).where(User.email == str(body.email), User.id != user.id),
        )
        if conflict.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email уже занят",
            )
        user.email = str(body.email)
    if body.password is not None:
        assert body.current_password is not None
        if not verify_password(body.current_password, user.hash_pass):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный текущий пароль",
            )
        user.hash_pass = hash_password(body.password)

    await db.commit()
    await db.refresh(user)
    return user


async def compute_worker_me_stats(user_id: UUID, db: AsyncSession) -> WorkerMeStatsRead:
    """Считает сделки по статусам; earn берётся из worker_stats (начисления по завершённым)."""

    row = await get_or_create_worker_stat(user_id, db)
    result = await db.execute(
        select(Deal.status, func.count(Deal.id)).where(Deal.worker_id == user_id).group_by(Deal.status),
    )
    by_status: dict[DealStatus, int] = {status: int(cnt) for status, cnt in result.all()}
    deals_total = sum(by_status.values())
    agree = (
        by_status.get(DealStatus.CONFIRMED, 0)
        + by_status.get(DealStatus.PAID, 0)
        + by_status.get(DealStatus.COMPLETED, 0)
    )
    paid_deals = by_status.get(DealStatus.PAID, 0) + by_status.get(DealStatus.COMPLETED, 0)
    return WorkerMeStatsRead(
        role=UserRole.WORKER,
        deals=deals_total,
        agree=agree,
        paid=paid_deals,
        earn=row.earn,
    )


async def get_or_create_worker_stat(user_id, db: AsyncSession) -> WorkerStat:
    result = await db.execute(select(WorkerStat).where(WorkerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = WorkerStat(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_or_create_blogger_stat(user_id, db: AsyncSession) -> BloggerStat:
    result = await db.execute(select(BloggerStat).where(BloggerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = BloggerStat(user_id=user_id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
