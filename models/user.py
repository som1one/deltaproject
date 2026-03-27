import uuid

from sqlalchemy import Enum as SQLEnum, ForeignKey, Integer, String, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base
from enums.user import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    telegram: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hash_pass: Mapped[str] = mapped_column(String(255), nullable=False)
    percent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, name="user_role", native_enum=True),
        nullable=False,
    )
    linked_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
