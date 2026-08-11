"""worker_nudge_log: журнал авто-пинков воркерам

Revision ID: nudge0a1b2c3d
Revises: tgchat0a1b2c
Create Date: 2026-08-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "nudge0a1b2c3d"
down_revision: Union[str, None] = "tgchat0a1b2c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "worker_nudge_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_worker_nudge_log_user_kind_sent",
        "worker_nudge_log",
        ["user_id", "kind", "sent_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_worker_nudge_log_user_kind_sent", table_name="worker_nudge_log")
    op.drop_table("worker_nudge_log")
