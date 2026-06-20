"""worker-referral-orders: new tables and marketplace_orders columns

Revision ID: x8y9z0a1b2c3
Revises: w7x8y9z0a1b2
Create Date: 2026-06-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "x8y9z0a1b2c3"
down_revision: Union[str, None] = "w7x8y9z0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. ALTER TABLE marketplace_orders: add new columns ---
    op.add_column(
        "marketplace_orders",
        sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("refund_reason", sa.String(length=1000), nullable=True),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "refunded_by",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column(
            "confirmed_by",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "marketplace_orders",
        sa.Column("blogger_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Foreign keys for new columns
    op.create_foreign_key(
        "fk_mkt_orders_refunded_by_users",
        "marketplace_orders",
        "users",
        ["refunded_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_mkt_orders_confirmed_by_users",
        "marketplace_orders",
        "users",
        ["confirmed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- 2. CREATE TABLE settlement_accounts ---
    op.create_table(
        "settlement_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_number", sa.String(length=20), nullable=False),
        sa.Column("bic", sa.String(length=9), nullable=False),
        sa.Column("bank_name", sa.String(length=255), nullable=False),
        sa.Column("recipient_name", sa.String(length=255), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name="fk_settlement_accounts_updated_by_users", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- 3. CREATE TABLE marketplace_messages ---
    op.create_table(
        "marketplace_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("text", sa.String(length=2000), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["sender_id"], ["users.id"], name="fk_mkt_messages_sender_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["recipient_id"], ["users.id"], name="fk_mkt_messages_recipient_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mkt_msg_conversation", "marketplace_messages", ["sender_id", "recipient_id"])
    op.create_index("ix_mkt_msg_created_at", "marketplace_messages", ["created_at"])

    # --- 4. CREATE TABLE notifications ---
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_notifications_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_unread", "notifications", ["user_id", "is_read"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    # --- 5. CREATE TABLE order_status_history ---
    op.create_table(
        "order_status_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("old_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=False),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["marketplace_orders.id"],
            name="fk_order_status_history_order_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"],
            ["users.id"],
            name="fk_order_status_history_changed_by",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_osh_order_id", "order_status_history", ["order_id"])


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index("ix_osh_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")

    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_user_unread", table_name="notifications")
    op.drop_table("notifications")

    op.drop_index("ix_mkt_msg_created_at", table_name="marketplace_messages")
    op.drop_index("ix_mkt_msg_conversation", table_name="marketplace_messages")
    op.drop_table("marketplace_messages")

    op.drop_table("settlement_accounts")

    # Drop FK constraints from marketplace_orders
    op.drop_constraint("fk_mkt_orders_confirmed_by_users", "marketplace_orders", type_="foreignkey")
    op.drop_constraint("fk_mkt_orders_refunded_by_users", "marketplace_orders", type_="foreignkey")

    # Drop columns from marketplace_orders
    op.drop_column("marketplace_orders", "blogger_confirmed_at")
    op.drop_column("marketplace_orders", "confirmed_by")
    op.drop_column("marketplace_orders", "refunded_by")
    op.drop_column("marketplace_orders", "refund_reason")
    op.drop_column("marketplace_orders", "refunded_at")
