"""Настройки приёма оплаты маркетплейса (singleton, id=1).

Хранит реквизиты карты администратора для ручных переводов
и ключи ЮKassa, задаваемые из админ-панели (приоритет над ENV).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class MarketplacePaymentSettings(Base):
    __tablename__ = "marketplace_payment_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # singleton, id=1

    # Карта администратора для приёма ручных переводов (показывается заказчику)
    card_number: Mapped[str | None] = mapped_column(String(19), nullable=True)
    card_holder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_bank: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sbp_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Ключи ЮKassa (задаются в админке; имеют приоритет над ENV)
    yookassa_shop_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    yookassa_secret_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    yookassa_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )

    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
