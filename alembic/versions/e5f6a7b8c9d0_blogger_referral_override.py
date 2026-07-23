"""blogger referral override (2nd level): order snapshot + settings pct

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # marketplace_settings: комиссия блогера-реферера (2-й уровень)
    op.add_column(
        "marketplace_settings",
        sa.Column(
            "blogger_referral_commission_pct",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("5.00"),
            nullable=False,
        ),
    )

    # marketplace_orders: снапшот блогера-реферера + процента на момент заказа
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "blogger_referrer_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "blogger_referrer_commission_pct",
            sa.Numeric(precision=5, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.create_foreign_key(
        "fk_mkt_orders_blogger_referrer_id_users",
        "marketplace_orders",
        "users",
        ["blogger_referrer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_mkt_orders_blogger_referrer_id",
        "marketplace_orders",
        ["blogger_referrer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_mkt_orders_blogger_referrer_id", table_name="marketplace_orders")
    op.drop_constraint(
        "fk_mkt_orders_blogger_referrer_id_users",
        "marketplace_orders",
        type_="foreignkey",
    )
    op.drop_column("marketplace_orders", "blogger_referrer_commission_pct")
    op.drop_column("marketplace_orders", "blogger_referrer_id")

    op.drop_column("marketplace_settings", "blogger_referral_commission_pct")
