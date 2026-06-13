"""users: add payout card metadata

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "u5v6w7x8y9z0"
down_revision: Union[str, None] = "t4u5v6w7x8y9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("payout_card_brand", sa.String(length=32), nullable=True))
    op.add_column("users", sa.Column("payout_card_holder", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "payout_card_holder")
    op.drop_column("users", "payout_card_brand")
