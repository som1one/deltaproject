import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from models.base import Base


class MarketplaceHeroConfig(Base):
    """Настройка витрины (hero) на лендинге маркетплейса.

    Одна строка (id=1). Задаётся из админки главного сайта:
      · featured_categories — до 3 ниш-чипов, которые показывать;
      · featured_all — user_id авторов для вкладки «Все ниши»;
      · featured_by_category — {category: [user_id, ...]} авторы по каждой нише.
    Если строка отсутствует/пустая — лендинг показывает демо-данные.
    """

    __tablename__ = "marketplace_hero_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    featured_categories: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        server_default=text("'[]'::json"),
    )
    featured_all: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        server_default=text("'[]'::json"),
    )
    featured_by_category: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        server_default=text("'{}'::json"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
