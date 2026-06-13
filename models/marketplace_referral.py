import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class MarketplaceReferral(Base):
    __tablename__ = "marketplace_referrals"
    __table_args__ = (
        UniqueConstraint("worker_id", name="uq_mkt_referrals_worker_id"),
        UniqueConstraint("ref_code", name="uq_mkt_referrals_ref_code"),
        Index("ix_mkt_referrals_worker_id", "worker_id"),
        Index("ix_mkt_referrals_ref_code", "ref_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    ref_code: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
