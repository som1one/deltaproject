"""create schema (users, ref_links, stats, deals, sessions)

Revision ID: f2c8a1b0d4e3
Revises: e888cd665b91
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f2c8a1b0d4e3"
down_revision: Union[str, Sequence[str], None] = "e888cd665b91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = postgresql.ENUM(
        "Worker",
        "Bloger",
        "Admin",
        name="user_role",
        create_type=True,
    )
    user_role.create(op.get_bind(), checkfirst=True)

    deal_status = postgresql.ENUM(
        "AGREE",
        "PAID",
        "CLOSE",
        name="deal_status",
        create_type=True,
    )
    deal_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("telegram", sa.String(length=255), nullable=True),
        sa.Column("hash_pass", sa.String(length=255), nullable=False),
        sa.Column("percent", sa.Float(), nullable=False, server_default="0"),
        sa.Column("balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "role",
            postgresql.ENUM(
                "Worker",
                "Bloger",
                "Admin",
                name="user_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("linked_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["linked_to"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_linked_to"), "users", ["linked_to"], unique=False)

    op.create_table(
        "ref_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("link", sa.String(length=2048), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ref_links_user_id"), "ref_links", ["user_id"], unique=True)

    op.create_table(
        "worker_stats",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deals", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("agree", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid", sa.Float(), nullable=False, server_default="0"),
        sa.Column("earn", sa.Float(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_worker_stats_user_id"),
        "worker_stats",
        ["user_id"],
        unique=True,
    )

    op.create_table(
        "bloger_stats",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deals", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("earn", sa.Float(), nullable=False, server_default="0"),
        sa.Column("workers", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bloger_stats_user_id"),
        "bloger_stats",
        ["user_id"],
        unique=True,
    )

    op.create_table(
        "deals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bloger_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_link", sa.String(length=2048), nullable=False),
        sa.Column("item_name", sa.String(length=512), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "AGREE",
                "PAID",
                "CLOSE",
                name="deal_status",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'AGREE'::deal_status"),
        ),
        sa.Column("price", sa.Float(), nullable=False),
        sa.Column("seller_tg", sa.String(length=255), nullable=False),
        sa.Column("seller_number", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["bloger_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["worker_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deals_bloger_id"), "deals", ["bloger_id"], unique=False)
    op.create_index(op.f("ix_deals_worker_id"), "deals", ["worker_id"], unique=False)

    op.create_table(
        "user_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=False),
        sa.Column("agent", sa.String(length=512), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("user_sessions")
    op.drop_index(op.f("ix_deals_worker_id"), table_name="deals")
    op.drop_index(op.f("ix_deals_bloger_id"), table_name="deals")
    op.drop_table("deals")
    op.drop_index(op.f("ix_bloger_stats_user_id"), table_name="bloger_stats")
    op.drop_table("bloger_stats")
    op.drop_index(op.f("ix_worker_stats_user_id"), table_name="worker_stats")
    op.drop_table("worker_stats")
    op.drop_index(op.f("ix_ref_links_user_id"), table_name="ref_links")
    op.drop_table("ref_links")
    op.drop_index(op.f("ix_users_linked_to"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    deal_status = postgresql.ENUM(name="deal_status")
    deal_status.drop(op.get_bind(), checkfirst=True)
    user_role = postgresql.ENUM(name="user_role")
    user_role.drop(op.get_bind(), checkfirst=True)
