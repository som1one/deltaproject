"""deals: client_contacted_at, agreed_price; users: payout card hash

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-04-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, None] = "h2i3j4k5l6m7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "deals",
        sa.Column("client_contacted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("deals", sa.Column("agreed_price_kopeks", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("payout_card_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("payout_card_last4", sa.String(length=4), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "payout_card_last4")
    op.drop_column("users", "payout_card_hash")
    op.drop_column("deals", "agreed_price_kopeks")
    op.drop_column("deals", "client_contacted_at")
