"""Telegram channel subscription settings & tracking."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class TelegramChannelConfig(Base):
    """Singleton row: required channel subscription config."""

    __tablename__ = "telegram_channel_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    channel_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="Telegram channel/chat ID (e.g. @channel or numeric -100...)",
    )
    channel_title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="",
        server_default="",
    )
    channel_url: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        default="",
        server_default="",
        comment="Public link (t.me/...) shown to user",
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        comment="Enable/disable subscription requirement globally",
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


class TelegramChannelSubscription(Base):
    """Records each confirmed subscription check (analytics)."""

    __tablename__ = "telegram_channel_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    telegram_user_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Telegram numeric user ID",
    )
    channel_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    registration_ip: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )
