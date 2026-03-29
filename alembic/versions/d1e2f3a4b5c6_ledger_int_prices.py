"""ledger_entries + int kopeks for deals and stats

Revision ID: d1e2f3a4b5c6
Revises: c5d0e1f2a3b4
Create Date: 2026-03-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c5d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE deals ALTER COLUMN price TYPE integer "
            "USING (ROUND(price * 100)::integer)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE worker_stats ALTER COLUMN paid TYPE integer "
            "USING (ROUND(paid * 100)::integer)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE worker_stats ALTER COLUMN earn TYPE integer "
            "USING (ROUND(earn * 100)::integer)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE bloger_stats ALTER COLUMN earn TYPE integer "
            "USING (ROUND(earn * 100)::integer)"
        )
    )

    ledger_status = postgresql.ENUM(
        "payout_request",
        "freeze",
        "pending_confirmation",
        "completed",
        "rejected",
        name="ledger_entry_status",
        create_type=True,
    )
    ledger_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "ledger_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_kopeks", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "payout_request",
                "freeze",
                "pending_confirmation",
                "completed",
                "rejected",
                name="ledger_entry_status",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_ledger_entries_idempotency_key"),
    )
    op.create_index(
        op.f("ix_ledger_entries_user_id"),
        "ledger_entries",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_ledger_entries_user_id_created_at",
        "ledger_entries",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_entries_user_id_created_at", table_name="ledger_entries")
    op.drop_index(op.f("ix_ledger_entries_user_id"), table_name="ledger_entries")
    op.drop_table("ledger_entries")

    ledger_status = postgresql.ENUM(name="ledger_entry_status")
    ledger_status.drop(op.get_bind(), checkfirst=True)

    op.execute(sa.text("ALTER TABLE bloger_stats ALTER COLUMN earn TYPE double precision USING (earn::double precision / 100.0)"))
    op.execute(sa.text("ALTER TABLE worker_stats ALTER COLUMN earn TYPE double precision USING (earn::double precision / 100.0)"))
    op.execute(sa.text("ALTER TABLE worker_stats ALTER COLUMN paid TYPE double precision USING (paid::double precision / 100.0)"))
    op.execute(sa.text("ALTER TABLE deals ALTER COLUMN price TYPE double precision USING (price::double precision / 100.0)"))
