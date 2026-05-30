import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class AdminPaymentDetails(Base):
    """Текущие реквизиты приёма платежей платформы (singleton-таблица).

    Хранится одна актуальная строка, которая заменяется при сохранении;
    история изменений ведётся в ``admin_audit_logs``. Полный номер
    Карты_Приёма хранится только в зашифрованном виде
    (``collection_card_pan_encrypted``) — открытой колонки PAN в БД нет.
    Отдельно хранится ``collection_card_last4`` для маскированного
    отображения и аудита.
    """

    __tablename__ = "admin_payment_details"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    collection_card_pan_encrypted: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    collection_card_last4: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True,
    )
    payment_link: Mapped[str | None] = mapped_column(
        String(2048),
        nullable=True,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
