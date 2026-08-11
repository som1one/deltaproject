import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class WorkerNudgeLog(Base):
    """Журнал пинков воркеру — защита от повторной отправки.

    Авто-пинки уходят по триггерам (зарегистрировался и не привёл никого,
    привёл, но нет заказов, давно не заходил). Запись здесь означает
    «такой пинок этому воркеру уже отправлялся»: фоновый цикл не повторит
    его раньше, чем через окно остывания (см. worker_nudge_service).

    Ручные рассылки админа сюда не пишутся — их адресность и частоту
    контролирует человек.
    """

    __tablename__ = "worker_nudge_log"
    __table_args__ = (
        Index("ix_worker_nudge_log_user_kind_sent", "user_id", "kind", "sent_at"),
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
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
