import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy import ForeignKey, Index, UniqueConstraint

from models.base import Base


class BloggerProfile(Base):
    __tablename__ = "blogger_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_blogger_profiles_user_id"),
        Index("ix_blogger_profiles_category", "category"),
        Index("ix_blogger_profiles_gender", "gender"),
        Index("ix_blogger_profiles_subscriber_count", "subscriber_count"),
        Index("ix_blogger_profiles_average_price_kopeks", "average_price_kopeks"),
        Index("ix_blogger_profiles_is_active", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    subscriber_count: Mapped[int] = mapped_column(Integer, nullable=False)
    average_price_kopeks: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    portfolio_links: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        server_default=text("'[]'::json"),
    )
    social_links: Mapped[list] = mapped_column(JSON, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    preferred_contact: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )
    orders_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
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
