"""marketplace: create marketplace tables

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8
Create Date: 2026-05-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "t4u5v6w7x8y9"
down_revision: Union[str, None] = "s3t4u5v6w7x8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. marketplace_settings — singleton config table
    op.create_table(
        "marketplace_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "platform_commission_pct",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default=sa.text("25.00"),
        ),
        sa.Column(
            "worker_referral_commission_pct",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default=sa.text("5.00"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Insert singleton row with defaults
    op.execute(
        sa.text(
            "INSERT INTO marketplace_settings (id, platform_commission_pct, worker_referral_commission_pct) "
            "VALUES (1, 25.00, 5.00)"
        )
    )

    # 2. blogger_profiles
    op.create_table(
        "blogger_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("subscriber_count", sa.Integer(), nullable=False),
        sa.Column("average_price_kopeks", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("portfolio_links", postgresql.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("social_links", postgresql.JSON(), nullable=False),
        sa.Column("photo_url", sa.String(length=2048), nullable=True),
        sa.Column("preferred_contact", sa.String(length=100), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("orders_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_blogger_profiles_user_id"),
    )
    op.create_index("ix_blogger_profiles_category", "blogger_profiles", ["category"])
    op.create_index("ix_blogger_profiles_subscriber_count", "blogger_profiles", ["subscriber_count"])
    op.create_index("ix_blogger_profiles_average_price_kopeks", "blogger_profiles", ["average_price_kopeks"])
    op.create_index("ix_blogger_profiles_is_active", "blogger_profiles", ["is_active"])

    # 3. marketplace_orders
    op.create_table(
        "marketplace_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("blogger_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default=sa.text("'PENDING_PAYMENT'")),
        sa.Column("amount_kopeks", sa.Integer(), nullable=False),
        sa.Column("message", sa.String(length=1000), nullable=False),
        sa.Column("platform_commission_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column(
            "worker_commission_pct",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("yookassa_payment_id", sa.String(length=80), nullable=True),
        sa.Column("payment_url", sa.String(length=2048), nullable=True),
        sa.Column("payment_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["client_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blogger_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["worker_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mkt_orders_status", "marketplace_orders", ["status"])
    op.create_index("ix_mkt_orders_created_at", "marketplace_orders", ["created_at"])
    op.create_index("ix_mkt_orders_client_status", "marketplace_orders", ["client_id", "status"])
    op.create_index("ix_mkt_orders_blogger_id", "marketplace_orders", ["blogger_id"])
    op.create_index("ix_mkt_orders_worker_id", "marketplace_orders", ["worker_id"])

    # 4. marketplace_escrow_ledger
    op.create_table(
        "marketplace_escrow_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("amount_kopeks", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["marketplace_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_mkt_escrow_idempotency_key"),
    )
    op.create_index("ix_mkt_escrow_order_id", "marketplace_escrow_ledger", ["order_id"])
    op.create_index("ix_mkt_escrow_user_id", "marketplace_escrow_ledger", ["user_id"])

    # 5. marketplace_withdrawals
    op.create_table(
        "marketplace_withdrawals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount_kopeks", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("yookassa_payout_id", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mkt_withdrawals_user_id", "marketplace_withdrawals", ["user_id"])

    # 6. support_tickets
    op.create_table(
        "support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitter_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submitter_role", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=2000), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'open'")),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_decision", sa.String(length=20), nullable=True),
        sa.Column("resolution_reason", sa.String(length=1000), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["order_id"], ["marketplace_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitter_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_tickets_order_id", "support_tickets", ["order_id"])
    op.create_index("ix_support_tickets_submitter_id", "support_tickets", ["submitter_id"])

    # 7. marketplace_referrals
    op.create_table(
        "marketplace_referrals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ref_code", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["worker_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("worker_id", name="uq_mkt_referrals_worker_id"),
        sa.UniqueConstraint("ref_code", name="uq_mkt_referrals_ref_code"),
    )
    op.create_index("ix_mkt_referrals_worker_id", "marketplace_referrals", ["worker_id"])
    op.create_index("ix_mkt_referrals_ref_code", "marketplace_referrals", ["ref_code"])


def downgrade() -> None:
    op.drop_table("marketplace_referrals")
    op.drop_table("support_tickets")
    op.drop_table("marketplace_withdrawals")
    op.drop_table("marketplace_escrow_ledger")
    op.drop_table("marketplace_orders")
    op.drop_table("blogger_profiles")
    op.drop_table("marketplace_settings")
