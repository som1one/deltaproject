import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID, INET
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    ip: Mapped[str] = mapped_column(INET, nullable=False)
    agent: Mapped[str] = mapped_column(String(512), nullable=False)
