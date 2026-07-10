"""marketplace overhaul: service registry, price lists, audience moderation,
reviews, premium requests, offer/deadline order lifecycle, chat extensions

Revision ID: a1b2c3d4e5f6
Revises: cc3d4e5f6a72
Create Date: 2026-07-10

"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "cc3d4e5f6a72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Стартовый реестр услуг — дальше правится из админки главного сайта.
_SEED_SERVICE_TYPES: list[tuple[str, str, str]] = [
    ("integration", "Интеграция в видео", "Рекламная вставка 30–90 секунд внутри ролика"),
    ("dedicated_video", "Отдельный ролик / обзор", "Полноценный ролик, посвящённый продукту"),
    ("preroll", "Pre-roll", "Короткая вставка в начале ролика"),
    ("post", "Пост в ленте", "Публикация в ленте Telegram / соцсети"),
    ("stories", "Stories", "Серия историй с упоминанием продукта"),
    ("shorts", "Reels / Shorts", "Вертикальное короткое видео"),
    ("stream_sponsor", "Спонсорство стрима", "Спонсорский сегмент или баннер на трансляции"),
    ("mention", "Упоминание / шоутаут", "Короткое устное или текстовое упоминание"),
]


def upgrade() -> None:
    # ── Реестр услуг ──
    op.create_table(
        "marketplace_service_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("code", name="uq_mkt_service_types_code"),
    )

    service_types_table = sa.table(
        "marketplace_service_types",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        service_types_table,
        [
            {
                "id": uuid.uuid4(),
                "code": code,
                "name": name,
                "description": description,
                "sort_order": index,
            }
            for index, (code, name, description) in enumerate(_SEED_SERVICE_TYPES)
        ],
    )

    # ── Прайс-лист автора ──
    op.create_table(
        "blogger_price_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("blogger_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("marketplace_service_types.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("price_kopeks", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "profile_id", "service_type_id", name="uq_price_item_profile_service"
        ),
    )
    op.create_index(
        "ix_blogger_price_items_profile_id", "blogger_price_items", ["profile_id"]
    )

    # ── Заявки на подтверждение аудитории ──
    op.create_table(
        "blogger_audience_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "profile_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("blogger_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("payload", postgresql.JSON(), nullable=False),
        sa.Column(
            "screenshots",
            postgresql.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
        sa.Column("review_comment", sa.String(length=1000), nullable=True),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_audience_submissions_status", "blogger_audience_submissions", ["status"]
    )
    op.create_index(
        "ix_audience_submissions_profile_id",
        "blogger_audience_submissions",
        ["profile_id"],
    )

    # ── Отзывы ──
    op.create_table(
        "marketplace_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("marketplace_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("order_id", "author_id", name="uq_review_order_author"),
    )
    op.create_index("ix_mkt_reviews_target_id", "marketplace_reviews", ["target_id"])

    # ── Заявки на премиум-размещение ──
    op.create_table(
        "marketplace_premium_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
        sa.Column("comment", sa.String(length=1000), nullable=True),
        sa.Column(
            "resolved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_premium_requests_status", "marketplace_premium_requests", ["status"]
    )

    # ── Профиль блогера: аудитория + видимость блоков ──
    op.add_column(
        "blogger_profiles", sa.Column("audience_stats", postgresql.JSON(), nullable=True)
    )
    op.add_column(
        "blogger_profiles",
        sa.Column("audience_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "blogger_profiles",
        sa.Column(
            "show_portfolio", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )
    op.add_column(
        "blogger_profiles",
        sa.Column(
            "show_socials", sa.Boolean(), nullable=False, server_default=sa.text("true")
        ),
    )

    # ── Заказы: услуга, оффер, сроки, сдача работы ──
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "service_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "marketplace_service_types.id",
                ondelete="SET NULL",
                name="fk_mkt_orders_service_type",
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("service_type_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "offered_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id", ondelete="SET NULL", name="fk_mkt_orders_offered_by"
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_orders", sa.Column("deadline_days", sa.Integer(), nullable=True)
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("publish_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("work_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("work_result", sa.String(length=2000), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("review_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("decline_reason", sa.String(length=1000), nullable=True),
    )

    # ── Сообщения: тип, привязка к заказу, payload оффера, прочитанность ──
    op.add_column(
        "marketplace_messages",
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="text"),
    )
    op.add_column(
        "marketplace_messages",
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "marketplace_orders.id", ondelete="SET NULL", name="fk_mkt_msg_order"
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_messages", sa.Column("payload", postgresql.JSON(), nullable=True)
    )
    op.add_column(
        "marketplace_messages",
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "ix_mkt_msg_recipient_unread", "marketplace_messages", ["recipient_id", "is_read"]
    )
    # Старые сообщения считаем прочитанными, чтобы не взорвать счётчики.
    op.execute("UPDATE marketplace_messages SET is_read = true")


def downgrade() -> None:
    op.drop_index("ix_mkt_msg_recipient_unread", table_name="marketplace_messages")
    op.drop_column("marketplace_messages", "is_read")
    op.drop_column("marketplace_messages", "payload")
    op.drop_constraint("fk_mkt_msg_order", "marketplace_messages", type_="foreignkey")
    op.drop_column("marketplace_messages", "order_id")
    op.drop_column("marketplace_messages", "kind")

    op.drop_column("marketplace_orders", "decline_reason")
    op.drop_column("marketplace_orders", "review_deadline_at")
    op.drop_column("marketplace_orders", "work_result")
    op.drop_column("marketplace_orders", "work_submitted_at")
    op.drop_column("marketplace_orders", "deadline_at")
    op.drop_column("marketplace_orders", "accepted_at")
    op.drop_column("marketplace_orders", "publish_at")
    op.drop_column("marketplace_orders", "deadline_days")
    op.drop_constraint("fk_mkt_orders_offered_by", "marketplace_orders", type_="foreignkey")
    op.drop_column("marketplace_orders", "offered_by")
    op.drop_column("marketplace_orders", "service_type_name")
    op.drop_constraint(
        "fk_mkt_orders_service_type", "marketplace_orders", type_="foreignkey"
    )
    op.drop_column("marketplace_orders", "service_type_id")

    op.drop_column("blogger_profiles", "show_socials")
    op.drop_column("blogger_profiles", "show_portfolio")
    op.drop_column("blogger_profiles", "audience_verified_at")
    op.drop_column("blogger_profiles", "audience_stats")

    op.drop_index("ix_premium_requests_status", table_name="marketplace_premium_requests")
    op.drop_table("marketplace_premium_requests")

    op.drop_index("ix_mkt_reviews_target_id", table_name="marketplace_reviews")
    op.drop_table("marketplace_reviews")

    op.drop_index(
        "ix_audience_submissions_profile_id", table_name="blogger_audience_submissions"
    )
    op.drop_index(
        "ix_audience_submissions_status", table_name="blogger_audience_submissions"
    )
    op.drop_table("blogger_audience_submissions")

    op.drop_index("ix_blogger_price_items_profile_id", table_name="blogger_price_items")
    op.drop_table("blogger_price_items")

    op.drop_table("marketplace_service_types")
