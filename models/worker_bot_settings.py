import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class WorkerBotSettings(Base):
    """Singleton-настройки бота управления воркерами.

    Пока здесь один тумблер — общий выключатель авто-пинков. Он нужен
    отдельно от правил конкретных триггеров: «выключить всё немедленно»
    должно быть одним действием, а не обходом трёх переключателей.
    """

    __tablename__ = "worker_bot_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    auto_nudges_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    # Пауза до момента: фоновый проход молчит, пока не наступит эта дата.
    # Нужна, чтобы отложить рассылку, не выключая её насовсем.
    paused_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
