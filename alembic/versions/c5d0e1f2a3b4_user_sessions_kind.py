"""user_sessions.session_kind for register vs login limits

Revision ID: c5d0e1f2a3b4
Revises: b3e9f1a2c8d0
Create Date: 2026-03-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c5d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b3e9f1a2c8d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_sessions",
        sa.Column(
            "session_kind",
            sa.String(length=16),
            server_default="register",
            nullable=False,
        ),
    )
    op.execute(
        sa.text("ALTER TABLE user_sessions ALTER COLUMN session_kind SET DEFAULT 'login'")
    )


def downgrade() -> None:
    op.drop_column("user_sessions", "session_kind")
