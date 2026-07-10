import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class MarketplaceMessage(Base):
    __tablename__ = "marketplace_messages"
    __table_args__ = (
        Index("ix_mkt_msg_conversation", "sender_id", "recipient_id"),
        Index("ix_mkt_msg_created_at", "created_at"),
        Index("ix_mkt_msg_recipient_unread", "recipient_id", "is_read"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(String(2000), nullable=False)
    # 'text' — обычное сообщение, 'offer' — карточка предложения услуги,
    # 'system' — служебные события сделки (принят, оплачен, сдан...)
    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=sa_text("'text'")
    )
    # Привязка к заказу для offer/system-сообщений
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("marketplace_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Снапшот условий оффера для отрисовки карточки в чате
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa_text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
