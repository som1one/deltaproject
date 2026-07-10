"""Отзывы по завершённым сделкам маркетплейса.

Текст отзыва приватен (виден только адресату), звёзды агрегируются в
публичный рейтинг: у авторов — в BloggerProfile.rating/reviews_count,
у заказчиков — считаются на лету для мини-профиля в чате.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from enums.marketplace import MarketplaceOrderStatus
from models.blogger_profile import BloggerProfile
from models.marketplace_order import MarketplaceOrder
from models.marketplace_review import MarketplaceReview


class ReviewError(ValueError):
    """Бизнес-ошибка создания отзыва."""


async def create_review(
    db: AsyncSession,
    *,
    order: MarketplaceOrder,
    author_id: uuid.UUID,
    rating: int,
    text: str | None,
) -> MarketplaceReview:
    """Создать отзыв по завершённой сделке (по одному с каждой стороны)."""
    if order.status != MarketplaceOrderStatus.COMPLETED.value:
        raise ReviewError("Отзыв можно оставить только по завершённой сделке")
    if author_id not in (order.client_id, order.blogger_id):
        raise ReviewError("Отзыв могут оставить только участники сделки")

    existing = (
        await db.execute(
            select(MarketplaceReview).where(
                MarketplaceReview.order_id == order.id,
                MarketplaceReview.author_id == author_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ReviewError("Вы уже оставили отзыв по этой сделке")

    target_id = order.blogger_id if author_id == order.client_id else order.client_id
    review = MarketplaceReview(
        order_id=order.id,
        author_id=author_id,
        target_id=target_id,
        rating=rating,
        text=(text or "").strip() or None,
    )
    db.add(review)
    await db.flush()

    # Рейтинг автора пересчитывается сразу — звёзды публичны.
    if target_id == order.blogger_id:
        await recompute_blogger_rating(db, blogger_user_id=target_id)

    return review


async def recompute_blogger_rating(
    db: AsyncSession, *, blogger_user_id: uuid.UUID
) -> None:
    """Пересчитать rating/reviews_count в профиле автора из отзывов."""
    profile = (
        await db.execute(
            select(BloggerProfile).where(BloggerProfile.user_id == blogger_user_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        return

    avg_rating, count = (
        await db.execute(
            select(
                func.avg(MarketplaceReview.rating), func.count(MarketplaceReview.id)
            ).where(MarketplaceReview.target_id == blogger_user_id)
        )
    ).one()

    profile.reviews_count = int(count or 0)
    profile.rating = (
        Decimal(str(round(float(avg_rating), 1))) if avg_rating is not None else None
    )
    await db.flush()


async def user_rating_summary(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[float | None, int]:
    """Средний рейтинг и число отзывов пользователя (для мини-профиля)."""
    avg_rating, count = (
        await db.execute(
            select(
                func.avg(MarketplaceReview.rating), func.count(MarketplaceReview.id)
            ).where(MarketplaceReview.target_id == user_id)
        )
    ).one()
    return (
        round(float(avg_rating), 1) if avg_rating is not None else None,
        int(count or 0),
    )


async def reviews_for_order(
    db: AsyncSession, *, order_id: uuid.UUID
) -> list[MarketplaceReview]:
    return list(
        (
            await db.execute(
                select(MarketplaceReview).where(MarketplaceReview.order_id == order_id)
            )
        ).scalars()
    )
