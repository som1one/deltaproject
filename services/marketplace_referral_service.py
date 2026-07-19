"""Marketplace Referral Service.

Handles worker referral link generation, resolution, commission history,
and immutability of the marketplace_referred_by field for the blogger marketplace.
"""

import secrets
import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.settings import settings
from enums.user import UserRole
from models.marketplace_escrow_ledger import MarketplaceEscrowEntry
from models.marketplace_referral import MarketplaceReferral
from models.user import User


class ReferralAlreadyAssignedError(Exception):
    """Raised when attempting to change an already-set marketplace_referred_by."""

    def __init__(self, user_id: uuid.UUID, existing_worker_id: uuid.UUID) -> None:
        self.user_id = user_id
        self.existing_worker_id = existing_worker_id
        super().__init__(
            f"User {user_id} is already referred by worker {existing_worker_id}. "
            "Referral assignment is permanent and cannot be changed."
        )


_REF_CODE_LENGTH = 10
_PAGE_SIZE = 50


def _generate_ref_code() -> str:
    """Generate a short alphanumeric referral code (10 chars)."""
    return secrets.token_urlsafe(_REF_CODE_LENGTH)[:_REF_CODE_LENGTH]


async def generate_referral_link(worker_id: uuid.UUID, db: AsyncSession) -> str:
    """Create or retrieve a unique referral link for the worker.

    If the worker already has a referral code, returns the existing link.
    Otherwise generates a new unique code and persists it.

    Returns:
        Full referral URL: {MARKETPLACE_FRONTEND_URL}/?ref={ref_code}
    """
    # Check if worker already has a referral code
    result = await db.execute(
        select(MarketplaceReferral).where(MarketplaceReferral.worker_id == worker_id)
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        return _build_referral_url(existing.ref_code)

    # Generate a new unique code with retry on collision
    for _ in range(5):
        ref_code = _generate_ref_code()
        referral = MarketplaceReferral(
            worker_id=worker_id,
            ref_code=ref_code,
        )
        db.add(referral)
        try:
            await db.flush()
            await db.commit()
            await db.refresh(referral)
            return _build_referral_url(referral.ref_code)
        except IntegrityError:
            await db.rollback()
            # If collision on ref_code, retry; if collision on worker_id,
            # another concurrent request created it — fetch and return
            result = await db.execute(
                select(MarketplaceReferral).where(
                    MarketplaceReferral.worker_id == worker_id
                )
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                return _build_referral_url(existing.ref_code)
            # ref_code collision — retry with new code
            continue

    # Extremely unlikely: 5 consecutive ref_code collisions
    raise RuntimeError("Failed to generate unique referral code after multiple attempts")


async def resolve_referral(ref_code: str, db: AsyncSession) -> uuid.UUID | None:
    """Resolve a referral code to a worker_id.

    Returns the worker_id if the ref_code exists and the worker is active.
    Returns None if the code is invalid or the worker is inactive.
    """
    result = await db.execute(
        select(MarketplaceReferral).where(MarketplaceReferral.ref_code == ref_code)
    )
    referral = result.scalar_one_or_none()

    if referral is None:
        return None

    # Check if the worker exists and is active
    worker = await db.get(User, referral.worker_id)
    if worker is None:
        return None
    if not worker.is_active:
        return None
    if worker.role != UserRole.WORKER:
        return None

    return referral.worker_id


async def assign_referral(
    user_id: uuid.UUID,
    worker_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Assign a worker referral to a client user (immutable operation).

    Sets `marketplace_referred_by` on the user. If the field is already set,
    raises ReferralAlreadyAssignedError — the referral binding is permanent
    and cannot be overwritten (Requirement 6.3).

    Args:
        user_id: The client user's ID.
        worker_id: The worker's ID to assign as referrer.
        db: Database session.

    Raises:
        ReferralAlreadyAssignedError: If user already has a referral assigned.
        ValueError: If the user is not found or not a Client.
    """
    user = await db.get(User, user_id)
    if user is None:
        raise ValueError(f"User {user_id} not found")
    if user.role != UserRole.CLIENT:
        raise ValueError(f"User {user_id} is not a Client")

    # Immutability check: if already assigned, reject any change
    if user.marketplace_referred_by is not None:
        if user.marketplace_referred_by == worker_id:
            # Same worker — idempotent, no-op
            return
        raise ReferralAlreadyAssignedError(user_id, user.marketplace_referred_by)

    # Validate that the worker exists and is active
    worker = await db.get(User, worker_id)
    if worker is None or worker.role != UserRole.WORKER:
        raise ValueError(f"Worker {worker_id} not found or not a Worker")

    user.marketplace_referred_by = worker_id
    await db.flush()


def get_worker_id_for_order(user: User) -> uuid.UUID | None:
    """Get the worker_id to assign to a new order from the client's referral binding.

    Returns the permanently-bound worker's ID from the client's
    `marketplace_referred_by` field. This is used when creating marketplace orders
    to snapshot the worker who should receive commission (Requirement 6.2, 6.4).

    Args:
        user: The client user creating the order.

    Returns:
        The worker UUID if the client was referred, None otherwise.
    """
    return user.marketplace_referred_by


async def get_referred_clients(
    worker_id: uuid.UUID,
    page: int,
    db: AsyncSession,
) -> tuple[list[dict], int]:
    """Get paginated list of clients referred by this worker.

    Args:
        worker_id: The worker's user ID.
        page: Page number (1-based).
        db: Database session.

    Returns:
        Tuple of (list of client dicts with id/name/created_at, total count).
    """
    offset = (max(1, page) - 1) * _PAGE_SIZE

    # Count total referred clients
    count_stmt = select(func.count(User.id)).where(
        User.marketplace_referred_by == worker_id,
        User.role == UserRole.CLIENT,
    )
    total = int((await db.execute(count_stmt)).scalar_one())

    # Fetch paginated clients
    stmt = (
        select(User)
        .where(
            User.marketplace_referred_by == worker_id,
            User.role == UserRole.CLIENT,
        )
        .order_by(User.id)
        .limit(_PAGE_SIZE)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    clients = [
        {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
        }
        for user in rows
    ]

    return clients, total


async def get_commission_history(
    worker_id: uuid.UUID,
    page: int,
    db: AsyncSession,
) -> tuple[list[dict], int]:
    """Get paginated commission history for a worker from the escrow ledger.

    Queries marketplace_escrow_ledger entries where user_id == worker_id
    and entry_type == "release_worker".

    Args:
        worker_id: The worker's user ID.
        page: Page number (1-based).
        db: Database session.

    Returns:
        Tuple of (list of commission entry dicts, total count).
    """
    offset = (max(1, page) - 1) * _PAGE_SIZE

    base_filter = [
        MarketplaceEscrowEntry.user_id == worker_id,
        MarketplaceEscrowEntry.entry_type == "release_worker",
    ]

    # Count total commission entries
    count_stmt = select(func.count(MarketplaceEscrowEntry.id)).where(*base_filter)
    total = int((await db.execute(count_stmt)).scalar_one())

    # Fetch paginated entries
    stmt = (
        select(MarketplaceEscrowEntry)
        .where(*base_filter)
        .order_by(MarketplaceEscrowEntry.created_at.desc())
        .limit(_PAGE_SIZE)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    entries = [
        {
            "id": str(entry.id),
            "order_id": str(entry.order_id),
            "amount_kopeks": entry.amount_kopeks,
            "note": entry.note,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        }
        for entry in rows
    ]

    return entries, total


def _build_referral_url(ref_code: str) -> str:
    """Build the full referral URL from a ref_code.

    Ведёт на главную, а не на регистрацию: приглашённый сначала знакомится
    с платформой, код подхватывает глобальный RefTracker и доживает до
    регистрации в localStorage. Старые ссылки на /auth/register?ref= тоже
    продолжают работать.
    """
    base_url = settings.marketplace_frontend_url.rstrip("/")
    return f"{base_url}/?ref={ref_code}"
