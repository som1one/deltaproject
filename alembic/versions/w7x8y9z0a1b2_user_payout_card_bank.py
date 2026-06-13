"""users: add payout_card_bank

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-06-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w7x8y9z0a1b2"
down_revision: Union[str, None] = "v6w7x8y9z0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("payout_card_bank", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "payout_card_bank")
