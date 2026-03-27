import uuid

from sqlalchemy import Enum as SQLEnum, ForeignKey, String, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base
from enums.deal import DealStatus


class Deal(Base):
    __tablename__ = "deals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    bloger_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    shop_link: Mapped[str] = mapped_column(String(2048), nullable=False)
    item_name: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[DealStatus] = mapped_column(
        SQLEnum(DealStatus, name="deal_status", native_enum=True),
        nullable=False,
        default=DealStatus.AGREE,
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    seller_tg: Mapped[str] = mapped_column(String(255), nullable=False)
    seller_number: Mapped[str] = mapped_column(String(64), nullable=False)
