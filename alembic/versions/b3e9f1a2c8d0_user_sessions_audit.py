"""user_sessions: created_at, user_id

Revision ID: b3e9f1a2c8d0
Revises: f2c8a1b0d4e3
Create Date: 2026-03-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b3e9f1a2c8d0"
down_revision: Union[str, Sequence[str], None] = "f2c8a1b0d4e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "user_sessions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "user_sessions_user_id_fkey",
        "user_sessions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_user_sessions_ip"), "user_sessions", ["ip"], unique=False)
    op.create_index(
        op.f("ix_user_sessions_user_id"),
        "user_sessions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_sessions_user_id"), table_name="user_sessions")
    op.drop_index(op.f("ix_user_sessions_ip"), table_name="user_sessions")
    op.drop_constraint("user_sessions_user_id_fkey", "user_sessions", type_="foreignkey")
    op.drop_column("user_sessions", "user_id")
    op.drop_column("user_sessions", "created_at")
