import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class BloggerAudienceSubmission(Base):
    """Заявка автора на подтверждение статистики аудитории.

    Автор заполняет данные от руки и прикладывает скриншоты из статистики
    площадки. Заявка уходит в админку; после подтверждения payload копируется
    в BloggerProfile.audience_stats и отображается в публичной карточке.
    """

    __tablename__ = "blogger_audience_submissions"
    __table_args__ = (
        Index("ix_audience_submissions_status", "status"),
        Index("ix_audience_submissions_profile_id", "profile_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("blogger_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    # {audience_age: [{label, percent}], audience_gender: {female, male},
    #  audience_geo: [...], audience_devices: [...], avg_views, posting_frequency,
    #  response_time, subscriber_count}
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Ссылки на загруженные скриншоты статистики (пруфы).
    screenshots: Mapped[list] = mapped_column(
        JSON, nullable=False, server_default=text("'[]'::json")
    )
    review_comment: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
