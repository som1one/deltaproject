import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.deal import DealStatus
from enums.ledger import LedgerEntryStatus
from enums.user import UserRole
from models.blogger_stat import BloggerStat
from models.deal import Deal
from models.deal_admin_log import DealAdminLog
from models.ledger_entry import LedgerEntry
from models.user import User
from models.worker_stat import WorkerStat

from schemas.deal import DealCreate, DealRead
from services.finance_scheme_service import (
    distribute_price_kopeks,
    get_or_create_scheme_for_blogger,
)


def deal_distribution_amount_kopeks(deal: Deal) -> int:
    if deal.agreed_price_kopeks is not None:
        return int(deal.agreed_price_kopeks)
    return int(deal.price)


def _blogger_masked(deal: Deal) -> bool:
    """До подтверждения админом блогер не видит контакты заказчика и сумму."""
    return deal.status in (DealStatus.NEW, DealStatus.REVIEW)


async def deal_to_read(deal: Deal, viewer: User, db: AsyncSession) -> DealRead:
    amount = deal_distribution_amount_kopeks(deal)
    masked = viewer.role == UserRole.BLOGER and _blogger_masked(deal)
    finance_visible = viewer.role != UserRole.BLOGER or not _blogger_masked(deal)
    if viewer.role == UserRole.ADMIN:
        finance_visible = True
        masked = False

    eff = 0 if masked else amount
    price_out = 0 if masked else int(deal.price)
    tg_out = "—" if masked else deal.seller_tg
    num_out = "—" if masked else deal.seller_number

    pw = pb = pp = None
    if finance_visible:
        scheme = await get_or_create_scheme_for_blogger(deal.bloger_id, db)
        wk, bk, _uk, pk = distribute_price_kopeks(amount, scheme)
        if viewer.role == UserRole.ADMIN:
            pw, pb, pp = wk, bk, pk
        elif viewer.role == UserRole.WORKER:
            pw = wk
        elif viewer.role == UserRole.BLOGER:
            pb = bk

    return DealRead(
        id=deal.id,
        worker_id=deal.worker_id,
        bloger_id=deal.bloger_id,
        shop_link=deal.shop_link,
        item_name=deal.item_name,
        status=deal.status,
        price=price_out,
        seller_tg=tg_out,
        seller_number=num_out,
        created_at=deal.created_at,
        client_contacted_at=deal.client_contacted_at,
        agreed_price_kopeks=None if masked else deal.agreed_price_kopeks,
        effective_price_kopeks=eff,
        sensitive_masked=masked,
        finance_visible=finance_visible,
        preview_worker_kopeks=pw,
        preview_blogger_kopeks=pb,
        preview_platform_kopeks=pp,
    )


def _paid_idempotency_keys(deal_id: uuid.UUID) -> tuple[str, str, str, str]:
    return (
        f"deal:{deal_id}:paid:worker",
        f"deal:{deal_id}:paid:bloger",
        f"deal:{deal_id}:paid:upline",
        f"deal:{deal_id}:paid:platform",
    )


async def _paid_bundle_exists(deal_id: uuid.UUID, db: AsyncSession) -> bool:
    keys = _paid_idempotency_keys(deal_id)
    result = await db.execute(
        select(LedgerEntry.id).where(LedgerEntry.idempotency_key.in_(keys)).limit(1),
    )
    return result.scalar_one_or_none() is not None


async def _get_or_create_worker_stat(user_id: uuid.UUID, db: AsyncSession) -> WorkerStat:
    result = await db.execute(select(WorkerStat).where(WorkerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = WorkerStat(user_id=user_id)
    db.add(row)
    await db.flush()
    return row


async def _get_or_create_blogger_stat(user_id: uuid.UUID, db: AsyncSession) -> BloggerStat:
    result = await db.execute(select(BloggerStat).where(BloggerStat.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = BloggerStat(user_id=user_id)
    db.add(row)
    await db.flush()
    return row


async def _accrue_paid_deal(deal: Deal, db: AsyncSession) -> None:
    if await _paid_bundle_exists(deal.id, db):
        return

    worker_user = await db.get(User, deal.worker_id)
    bloger_user = await db.get(User, deal.bloger_id)
    if worker_user is None or bloger_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Участники сделки не найдены",
        )

    scheme = await get_or_create_scheme_for_blogger(deal.bloger_id, db)
    dist = deal_distribution_amount_kopeks(deal)
    wk, bk, uk, pk = distribute_price_kopeks(dist, scheme)

    upline_user: User | None = None
    if bloger_user.linked_to is not None:
        cand = await db.get(User, bloger_user.linked_to)
        if cand is not None and cand.role == UserRole.BLOGER:
            upline_user = cand
    if upline_user is None:
        bk += uk
        uk = 0

    platform_user = await db.get(User, settings.platform_revenue_user_id)
    if platform_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Системный счёт площадки не настроен",
        )

    key_worker, key_bloger, key_upline, key_platform = _paid_idempotency_keys(deal.id)

    async def credit(user_id: uuid.UUID, amount: int, idem_key: str, note: str) -> None:
        if amount <= 0:
            return
        u = await db.get(User, user_id)
        if u is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Получатель начисления не найден",
            )
        u.balance += amount
        db.add(
            LedgerEntry(
                user_id=user_id,
                deal_id=deal.id,
                amount_kopeks=amount,
                status=LedgerEntryStatus.COMPLETED,
                idempotency_key=idem_key,
                note=note,
            ),
        )

    await credit(deal.worker_id, wk, key_worker, "Начисление по сделке (работник)")
    await credit(deal.bloger_id, bk, key_bloger, "Начисление по сделке (блогер)")
    if upline_user is not None and uk > 0:
        await credit(upline_user.id, uk, key_upline, "Начисление по сделке (аплайн-блогер)")
    await credit(platform_user.id, pk, key_platform, "Доля площадки по сделке")


async def _apply_completed_stats(deal: Deal, db: AsyncSession) -> None:
    bloger_user = await db.get(User, deal.bloger_id)
    if bloger_user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Блогер сделки не найден",
        )
    scheme = await get_or_create_scheme_for_blogger(deal.bloger_id, db)
    dist = deal_distribution_amount_kopeks(deal)
    wk, bk, uk, _pk = distribute_price_kopeks(dist, scheme)

    upline_user: User | None = None
    if bloger_user.linked_to is not None:
        cand = await db.get(User, bloger_user.linked_to)
        if cand is not None and cand.role == UserRole.BLOGER:
            upline_user = cand
    if upline_user is None:
        bk += uk
        uk = 0

    wstat = await _get_or_create_worker_stat(deal.worker_id, db)
    bstat = await _get_or_create_blogger_stat(deal.bloger_id, db)

    wstat.deals += 1
    wstat.agree += 1
    wstat.paid += deal_distribution_amount_kopeks(deal)
    wstat.earn += wk

    bstat.deals += 1
    bstat.earn += bk

    if upline_user is not None and uk > 0:
        ustat = await _get_or_create_blogger_stat(upline_user.id, db)
        ustat.earn += uk


async def create_deal(worker: User, body: DealCreate, db: AsyncSession) -> Deal:
    if worker.role != UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Создавать сделки может только работник",
        )
    blogger = await db.get(User, body.bloger_id)
    if blogger is None or blogger.role != UserRole.BLOGER or not blogger.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Указан несуществующий, неактивный или не-блогер",
        )
    deal = Deal(
        worker_id=worker.id,
        bloger_id=body.bloger_id,
        shop_link=body.shop_link,
        item_name=body.item_name,
        seller_tg=body.seller_tg,
        seller_number=body.seller_number,
        price=body.price,
    )
    db.add(deal)
    await db.commit()
    await db.refresh(deal)
    return deal


async def get_deal_for_user(
    deal_id: uuid.UUID,
    user: User,
    db: AsyncSession,
) -> Deal | None:
    deal = await db.get(Deal, deal_id)
    if deal is None:
        return None
    if user.id not in (deal.worker_id, deal.bloger_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этой сделке",
        )
    return deal


async def patch_deal_status(
    deal_id: uuid.UUID,
    user: User,
    new_status: DealStatus,
    db: AsyncSession,
) -> Deal | None:
    deal = await get_deal_for_user(deal_id, user, db)
    if deal is None:
        return None

    await db.execute(select(Deal).where(Deal.id == deal.id).with_for_update())
    await db.refresh(deal)

    old_status = deal.status

    if user.role == UserRole.WORKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Работник не меняет статус: принятие — у блогера, дальше — администратор",
        )

    if user.role == UserRole.BLOGER:
        if deal.bloger_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Это не ваша сделка",
            )
        if not (old_status == DealStatus.NEW and new_status == DealStatus.REVIEW):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Блогер может только принять заявку: статус NEW → REVIEW",
            )
        deal.status = new_status
        await db.commit()
        await db.refresh(deal)
        return deal

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Смена статуса доступна блогеру или через админку",
    )


async def list_deals_for_user(user: User, db: AsyncSession) -> list[Deal]:
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Список сделок кабинета для этой роли не предусмотрен",
        )
    result = await db.execute(
        select(Deal)
        .where(or_(Deal.worker_id == user.id, Deal.bloger_id == user.id))
        .order_by(Deal.created_at.desc()),
    )
    return list(result.scalars().all())


async def admin_list_deals(
    db: AsyncSession,
    *,
    status_filter: DealStatus | None,
    worker_id: uuid.UUID | None,
    bloger_id: uuid.UUID | None,
    created_from: datetime | None,
    created_to: datetime | None,
) -> list[Deal]:
    if worker_id is not None:
        worker = await db.get(User, worker_id)
        if worker is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Работник не найден")
    if bloger_id is not None:
        blogger = await db.get(User, bloger_id)
        if blogger is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Блогер не найден")

    stmt = select(Deal)
    if status_filter is not None:
        stmt = stmt.where(Deal.status == status_filter)
    if worker_id is not None:
        stmt = stmt.where(Deal.worker_id == worker_id)
    if bloger_id is not None:
        stmt = stmt.where(Deal.bloger_id == bloger_id)
    if created_from is not None:
        stmt = stmt.where(Deal.created_at >= created_from)
    if created_to is not None:
        stmt = stmt.where(Deal.created_at <= created_to)

    result = await db.execute(stmt.order_by(Deal.created_at.desc()))
    rows = list(result.scalars().all())
    if worker_id is not None and not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделки не найдены")
    if bloger_id is not None and not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделки не найдены")
    return rows


async def admin_get_deal(deal_id: uuid.UUID, db: AsyncSession) -> Deal:
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделка не найдена")
    return deal


def _status_order(status_value: DealStatus) -> int:
    order = {
        DealStatus.NEW: 0,
        DealStatus.REVIEW: 1,
        DealStatus.CONFIRMED: 2,
        DealStatus.PAID: 3,
        DealStatus.COMPLETED: 4,
    }
    return order[status_value]


async def admin_patch_deal_status(
    deal_id: uuid.UUID,
    admin_user: User,
    new_status: DealStatus,
    reason: str,
    db: AsyncSession,
) -> Deal:
    deal = (
        await db.execute(select(Deal).where(Deal.id == deal_id).with_for_update())
    ).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделка не найдена")

    old_status = deal.status
    if old_status == new_status:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Статус сделки уже установлен")

    deal.status = new_status

    if new_status == DealStatus.CONFIRMED and deal.client_contacted_at is None:
        deal.client_contacted_at = datetime.now(UTC)

    # При переводе в PAID гарантируем начисления (идемпотентно внутри _accrue_paid_deal).
    if _status_order(new_status) >= _status_order(DealStatus.PAID) and _status_order(old_status) < _status_order(DealStatus.PAID):
        await _accrue_paid_deal(deal, db)

    if new_status == DealStatus.COMPLETED and old_status != DealStatus.COMPLETED:
        await _apply_completed_stats(deal, db)

    db.add(
        DealAdminLog(
            deal_id=deal.id,
            admin_id=admin_user.id,
            action="status_patch",
            old_status=old_status,
            new_status=new_status,
            reason=reason.strip(),
        ),
    )
    await db.commit()
    await db.refresh(deal)
    return deal


async def admin_set_agreed_price(
    deal_id: uuid.UUID,
    admin_user: User,
    agreed_price_kopeks: int,
    reason: str,
    db: AsyncSession,
) -> Deal:
    deal = (
        await db.execute(select(Deal).where(Deal.id == deal_id).with_for_update())
    ).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделка не найдена")
    if deal.status != DealStatus.CONFIRMED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Согласованную сумму задают в статусе CONFIRMED (до перевода в PAID)",
        )
    prev = deal.agreed_price_kopeks
    deal.agreed_price_kopeks = agreed_price_kopeks
    db.add(
        DealAdminLog(
            deal_id=deal.id,
            admin_id=admin_user.id,
            action="agreed_price",
            old_status=deal.status,
            new_status=deal.status,
            reason=f"{reason.strip()} | agreed_price_kopeks: {prev} -> {agreed_price_kopeks}",
        ),
    )
    await db.commit()
    await db.refresh(deal)
    return deal


async def admin_recalc_deal_finance(
    deal_id: uuid.UUID,
    admin_user: User,
    reason: str,
    db: AsyncSession,
) -> Deal:
    deal = (
        await db.execute(select(Deal).where(Deal.id == deal_id).with_for_update())
    ).scalar_one_or_none()
    if deal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сделка не найдена")
    if _status_order(deal.status) < _status_order(DealStatus.PAID):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пересчёт финансов доступен только для сделок со статусом PAID или COMPLETED",
        )

    await _accrue_paid_deal(deal, db)
    db.add(
        DealAdminLog(
            deal_id=deal.id,
            admin_id=admin_user.id,
            action="recalc_finance",
            old_status=deal.status,
            new_status=deal.status,
            reason=reason.strip(),
        ),
    )
    await db.commit()
    await db.refresh(deal)
    return deal
