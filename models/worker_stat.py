import uuid

from sqlalchemy import ForeignKey, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class WorkerStat(Base):
    __tablename__ = "worker_stats"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    deals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agree: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paid: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    earn: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
