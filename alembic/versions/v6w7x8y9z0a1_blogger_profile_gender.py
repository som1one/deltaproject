"""Add gender to blogger profiles.

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-06-09 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "v6w7x8y9z0a1"
down_revision: Union[str, None] = "u5v6w7x8y9z0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("blogger_profiles", sa.Column("gender", sa.String(length=20), nullable=True))
    op.create_index("ix_blogger_profiles_gender", "blogger_profiles", ["gender"])


def downgrade() -> None:
    op.drop_index("ix_blogger_profiles_gender", table_name="blogger_profiles")
    op.drop_column("blogger_profiles", "gender")
