import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class WorkerNudgeRule(Base):
    """Правило авто-пинка: когда срабатывает и что пишем.

    Раньше триггеры и тексты были захардкожены — правка формулировки
    требовала выкатки. Теперь строки живут здесь и редактируются в админке;
    значения по умолчанию засеваются из кода при первом обращении.
    """

    __tablename__ = "worker_nudge_rules"
    __table_args__ = (UniqueConstraint("kind", name="uq_worker_nudge_rules_kind"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    # Окно остывания: столько дней этот пинок не повторится тому же воркеру.
    cooldown_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # Порог срабатывания в днях. Смысл зависит от триггера: для no_referrals —
    # сколько дней прошло с регистрации, для silent — сколько длится тишина.
    # Для триггеров без временного порога (no_orders) значение игнорируется.
    threshold_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    text_template: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
