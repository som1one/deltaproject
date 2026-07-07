"""marketplace hero config + blogger showcase metrics

Revision ID: bb2c3d4e5f61
Revises: aa1b2c3d4e5f
Create Date: 2026-07-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "bb2c3d4e5f61"
down_revision: Union[str, None] = "aa1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Витринные метрики автора (nullable — заполняются не у всех).
    op.add_column(
        "blogger_profiles",
        sa.Column("engagement_rate", sa.Numeric(precision=4, scale=1), nullable=True),
    )
    op.add_column(
        "blogger_profiles",
        sa.Column("rating", sa.Numeric(precision=2, scale=1), nullable=True),
    )
    op.add_column(
        "blogger_profiles",
        sa.Column("reviews_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )

    # Настройка витрины лендинга (одна строка).
    op.create_table(
        "marketplace_hero_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("featured_categories", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("featured_all", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("featured_by_category", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("marketplace_hero_config")
    op.drop_column("blogger_profiles", "reviews_count")
    op.drop_column("blogger_profiles", "rating")
    op.drop_column("blogger_profiles", "engagement_rate")
