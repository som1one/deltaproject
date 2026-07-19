"""users: add banned_at / ban_reason (бан администратором)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-19

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("ban_reason", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "banned_at")
