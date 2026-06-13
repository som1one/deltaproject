"""marketplace: add Client to user_role enum, add marketplace columns to users

Revision ID: s3t4u5v6w7x8
Revises: r2s3t4u5v6w7
Create Date: 2026-05-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "s3t4u5v6w7x8"
down_revision: Union[str, None] = "r2s3t4u5v6w7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add 'Client' value to user_role enum
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Client'"))

    # 2. Add marketplace_referred_by column (UUID FK to users, nullable)
    op.add_column(
        "users",
        sa.Column("marketplace_referred_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_marketplace_referred_by_users",
        "users",
        "users",
        ["marketplace_referred_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_users_marketplace_referred_by",
        "users",
        ["marketplace_referred_by"],
        unique=False,
    )

    # 3. Add marketplace_balance_kopeks column (int, default 0)
    op.add_column(
        "users",
        sa.Column(
            "marketplace_balance_kopeks",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "marketplace_balance_kopeks")
    op.drop_index("ix_users_marketplace_referred_by", table_name="users")
    op.drop_constraint("fk_users_marketplace_referred_by_users", "users", type_="foreignkey")
    op.drop_column("users", "marketplace_referred_by")
    # PostgreSQL does not support removing a single value from an enum.
    # The 'Client' value remains in user_role (documented no-op).
