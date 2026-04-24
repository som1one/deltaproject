"""ledger_entries: yookassa_payout_id for ЮKassa payouts

Revision ID: g1h2i3j4k5l6
Revises: f4e5d6c7b8a9
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, None] = "f4e5d6c7b8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ledger_entries",
        sa.Column("yookassa_payout_id", sa.String(length=80), nullable=True),
    )
    op.create_index(
        "ix_ledger_entries_yookassa_payout_id",
        "ledger_entries",
        ["yookassa_payout_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_yookassa_payout_id", table_name="ledger_entries")
    op.drop_column("ledger_entries", "yookassa_payout_id")
