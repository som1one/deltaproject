import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class MarketplaceOrder(Base):
    __tablename__ = "marketplace_orders"
    __table_args__ = (
        Index("ix_mkt_orders_status", "status"),
        Index("ix_mkt_orders_created_at", "created_at"),
        Index("ix_mkt_orders_client_status", "client_id", "status"),
        Index("ix_mkt_orders_blogger_id", "blogger_id"),
        Index("ix_mkt_orders_worker_id", "worker_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    blogger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    worker_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'PENDING_PAYMENT'"),
    )
    amount_kopeks: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    # Услуга из реестра: FK + снапшот названия на момент создания заказа
    service_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("marketplace_service_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    service_type_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Оффер: кто предложил условия (клиент из карточки/чата или блогер из чата)
    offered_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Сроки: дней на выполнение и/или конкретная дата публикации
    deadline_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publish_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Дедлайн, зафиксированный в момент принятия оффера
    deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Сдача работы блогером: ссылка/комментарий + метка времени
    work_submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    work_result: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # У заказчика 3 дня на приёмку после сдачи; после — авто-подтверждение
    review_deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Причина отказа от оффера / возврата работы на доработку
    decline_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Commission snapshot at order creation time
    platform_commission_pct: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
    )
    worker_commission_pct: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
        server_default=text("0"),
    )
    # YooKassa payment
    yookassa_payment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    payment_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    payment_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Refund tracking
    refunded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    refund_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    refunded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Payment confirmation tracking
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Blogger confirmation timestamp
    blogger_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Клиент сообщил, что перевёл оплату по реквизитам (ручной приём)
    payment_reported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
