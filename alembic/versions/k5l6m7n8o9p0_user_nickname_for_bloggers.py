"""users: add blogger nickname

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, None] = "j4k5l6m7n8o9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_users_nickname", "users", ["nickname"])


def downgrade() -> None:
    op.drop_constraint("uq_users_nickname", "users", type_="unique")
    op.drop_column("users", "nickname")
