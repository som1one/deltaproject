"""users: blogger cabinet PIN hash

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "j4k5l6m7n8o9"
down_revision: Union[str, None] = "i3j4k5l6m7n8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("blogger_cabinet_pin_hash", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("blogger_cabinet_pin_set_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "blogger_cabinet_pin_set_at")
    op.drop_column("users", "blogger_cabinet_pin_hash")
