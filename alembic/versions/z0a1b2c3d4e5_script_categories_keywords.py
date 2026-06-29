"""add category and keywords to worker_message_scripts

Revision ID: z0a1b2c3d4e5
Revises: y9z0a1b2c3d4
Create Date: 2026-06-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "z0a1b2c3d4e5"
down_revision: Union[str, None] = "y9z0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "worker_message_scripts",
        sa.Column("category", sa.String(length=255), nullable=False, server_default="Общие"),
    )
    op.add_column(
        "worker_message_scripts",
        sa.Column("keywords", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("worker_message_scripts", "keywords")
    op.drop_column("worker_message_scripts", "category")
