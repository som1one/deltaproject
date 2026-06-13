import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base
from enums.user import UserRole


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "uq_users_single_admin",
            "role",
            unique=True,
            postgresql_where=text("role = 'Admin'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    nickname: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hash_pass: Mapped[str] = mapped_column(String(255), nullable=False)
    percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
    )
    linked_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Семантика «блогер → наставник-блогер (аплайн)»: единственный источник истины
    # для определения реферальной доли. В отличие от linked_to («работник → пригласивший
    # блогер»), используется Сервисом_Начислений для назначения аплайна.
    upline_blogger_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payout_card_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payout_card_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    payout_card_brand: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payout_card_holder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payout_card_bank: Mapped[str | None] = mapped_column(String(64), nullable=True)
    blogger_cabinet_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blogger_cabinet_pin_set_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Marketplace: permanent worker association for clients registered via referral
    marketplace_referred_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Marketplace: earnings balance in kopeks (separate from deal-based `balance`)
    marketplace_balance_kopeks: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
