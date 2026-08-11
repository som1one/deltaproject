"""worker_bot_settings + worker_nudge_rules: управление ботом из админки

Авто-пинки после этой миграции выключены (auto_nudges_enabled=false):
включаются осознанно из админки, а не сами по факту выкатки.

Revision ID: botadm0a1b2c
Revises: nudge0a1b2c3d
Create Date: 2026-08-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "botadm0a1b2c"
down_revision: Union[str, None] = "nudge0a1b2c3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "worker_bot_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "auto_nudges_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("paused_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "worker_nudge_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column(
            "is_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("cooldown_days", sa.Integer(), nullable=False),
        sa.Column(
            "threshold_days", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("text_template", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", name="uq_worker_nudge_rules_kind"),
    )


def downgrade() -> None:
    op.drop_table("worker_nudge_rules")
    op.drop_table("worker_bot_settings")
