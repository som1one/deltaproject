"""deal admin logs table

Revision ID: b1c2d3e4f5a6
Revises: a9c3d4e5f6a7
Create Date: 2026-03-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a9c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deal_admin_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column(
            "old_status",
            postgresql.ENUM(
                "NEW",
                "REVIEW",
                "CONFIRMED",
                "PAID",
                "COMPLETED",
                name="deal_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column(
            "new_status",
            postgresql.ENUM(
                "NEW",
                "REVIEW",
                "CONFIRMED",
                "PAID",
                "COMPLETED",
                name="deal_status",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_deal_admin_logs_admin_id", "deal_admin_logs", ["admin_id"], unique=False)
    op.create_index("ix_deal_admin_logs_deal_id", "deal_admin_logs", ["deal_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_deal_admin_logs_deal_id", table_name="deal_admin_logs")
    op.drop_index("ix_deal_admin_logs_admin_id", table_name="deal_admin_logs")
    op.drop_table("deal_admin_logs")
