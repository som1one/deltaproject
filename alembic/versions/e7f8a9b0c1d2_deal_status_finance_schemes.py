"""deal_status 5 values, created_at, blogger_finance_schemes, platform user

Revision ID: e7f8a9b0c1d2
Revises: d1e2f3a4b5c6
Create Date: 2026-03-27

"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PLATFORM_USER_ID = "00000000-0000-4000-8000-000000000001"
PLATFORM_HASH = "2011a66af377e80e1243dc71533557b8b159c9c586e5deb6f22c2002b2b6670e"


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))

    op.execute(
        sa.text(
            f"""
            INSERT INTO users (id, name, email, telegram, hash_pass, percent, balance, role)
            VALUES (
                '{PLATFORM_USER_ID}'::uuid,
                'Platform',
                'platform@internal.delta',
                NULL,
                '{PLATFORM_HASH}',
                0,
                0,
                'Admin'
            )
            ON CONFLICT (id) DO NOTHING
            """
        ),
    )

    op.execute(sa.text("CREATE TYPE deal_status_new AS ENUM ('NEW','REVIEW','CONFIRMED','PAID','COMPLETED')"))

    op.add_column(
        "deals",
        sa.Column(
            "status_new",
            postgresql.ENUM(
                "NEW",
                "REVIEW",
                "CONFIRMED",
                "PAID",
                "COMPLETED",
                name="deal_status_new",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE deals SET status_new = CASE status::text
                WHEN 'AGREE' THEN 'NEW'::deal_status_new
                WHEN 'PAID' THEN 'PAID'::deal_status_new
                WHEN 'CLOSE' THEN 'COMPLETED'::deal_status_new
                ELSE 'NEW'::deal_status_new
            END
            """
        ),
    )
    op.alter_column("deals", "status_new", nullable=False)
    op.drop_column("deals", "status")
    op.execute(sa.text("ALTER TABLE deals RENAME COLUMN status_new TO status"))
    op.execute(sa.text("DROP TYPE deal_status"))
    op.execute(sa.text("ALTER TYPE deal_status_new RENAME TO deal_status"))
    op.execute(sa.text("ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'NEW'::deal_status"))

    op.add_column(
        "deals",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "blogger_finance_schemes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("blogger_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("weight_worker", sa.Integer(), nullable=False),
        sa.Column("weight_bloger", sa.Integer(), nullable=False),
        sa.Column("weight_upline", sa.Integer(), nullable=False),
        sa.Column("weight_platform", sa.Integer(), nullable=False),
        sa.CheckConstraint("weight_worker >= 0", name="ck_bf_weight_worker_nonneg"),
        sa.CheckConstraint("weight_bloger >= 0", name="ck_bf_weight_bloger_nonneg"),
        sa.CheckConstraint("weight_upline >= 0", name="ck_bf_weight_upline_nonneg"),
        sa.CheckConstraint("weight_platform >= 0", name="ck_bf_weight_platform_nonneg"),
        sa.CheckConstraint(
            "weight_worker + weight_bloger + weight_upline + weight_platform > 0",
            name="ck_bf_weights_sum_pos",
        ),
        sa.ForeignKeyConstraint(["blogger_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("blogger_id", name="uq_blogger_finance_schemes_blogger_id"),
    )

    bind = op.get_bind()
    bloggers = bind.execute(sa.text("SELECT id FROM users WHERE role = 'Bloger'")).fetchall()
    for (bid,) in bloggers:
        bind.execute(
            sa.text(
                """
                INSERT INTO blogger_finance_schemes
                    (id, blogger_id, weight_worker, weight_bloger, weight_upline, weight_platform)
                VALUES (:id, :bid, 2000, 5000, 1000, 8000)
                """
            ),
            {"id": str(uuid.uuid4()), "bid": str(bid)},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM blogger_finance_schemes"))
    op.drop_table("blogger_finance_schemes")

    op.drop_column("deals", "created_at")

    op.execute(sa.text("CREATE TYPE deal_status_old AS ENUM ('AGREE','PAID','CLOSE')"))
    op.add_column(
        "deals",
        sa.Column(
            "status_old",
            postgresql.ENUM("AGREE", "PAID", "CLOSE", name="deal_status_old", create_type=False),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE deals SET status_old = CASE status::text
                WHEN 'NEW' THEN 'AGREE'::deal_status_old
                WHEN 'REVIEW' THEN 'AGREE'::deal_status_old
                WHEN 'CONFIRMED' THEN 'AGREE'::deal_status_old
                WHEN 'PAID' THEN 'PAID'::deal_status_old
                WHEN 'COMPLETED' THEN 'CLOSE'::deal_status_old
                ELSE 'AGREE'::deal_status_old
            END
            """
        ),
    )
    op.alter_column("deals", "status_old", nullable=False)
    op.drop_column("deals", "status")
    op.execute(sa.text("ALTER TABLE deals RENAME COLUMN status_old TO status"))
    op.execute(sa.text("DROP TYPE deal_status"))
    op.execute(sa.text("ALTER TYPE deal_status_old RENAME TO deal_status"))
    op.execute(sa.text("ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'AGREE'::deal_status"))

    op.execute(sa.text(f"DELETE FROM users WHERE id = '{PLATFORM_USER_ID}'::uuid"))
