import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class BloggerFinanceScheme(Base):
    """Жёсткое распределение суммы сделки (веса как в ТЗ; сумма весов > 0)."""

    __tablename__ = "blogger_finance_schemes"
    __table_args__ = (
        CheckConstraint("weight_worker >= 0", name="ck_bf_weight_worker_nonneg"),
        CheckConstraint("weight_bloger >= 0", name="ck_bf_weight_bloger_nonneg"),
        CheckConstraint("weight_upline >= 0", name="ck_bf_weight_upline_nonneg"),
        CheckConstraint("weight_platform >= 0", name="ck_bf_weight_platform_nonneg"),
        CheckConstraint(
            "weight_worker + weight_bloger + weight_upline + weight_platform > 0",
            name="ck_bf_weights_sum_pos",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    blogger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    weight_worker: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_bloger: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_upline: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_platform: Mapped[int] = mapped_column(Integer, nullable=False)
