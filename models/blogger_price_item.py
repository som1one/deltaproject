import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class BloggerPriceItem(Base):
    """Позиция прайс-листа автора: цена на конкретный тип услуги из реестра."""

    __tablename__ = "blogger_price_items"
    __table_args__ = (
        UniqueConstraint(
            "profile_id", "service_type_id", name="uq_price_item_profile_service"
        ),
        Index("ix_blogger_price_items_profile_id", "profile_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("blogger_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("marketplace_service_types.id", ondelete="CASCADE"),
        nullable=False,
    )
    price_kopeks: Mapped[int] = mapped_column(Integer, nullable=False)
    # Условия автора по услуге: хронометраж, площадка, нюансы формата.
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
