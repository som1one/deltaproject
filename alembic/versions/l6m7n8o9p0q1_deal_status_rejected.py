"""deals: add REJECTED status

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-05-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "l6m7n8o9p0q1"
down_revision: Union[str, None] = "k5l6m7n8o9p0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE требует commit вне транзакции для совместимости
    # со старыми версиями PostgreSQL (<= 11). 12+ поддерживает в транзакции.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'REJECTED'"))


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление одного значения из enum,
    # пересоздаём тип целиком. Перед этим возвращаем все REJECTED-сделки в NEW,
    # чтобы downgrade не падал.
    op.execute(
        sa.text(
            """
            UPDATE deals SET status = 'NEW' WHERE status::text = 'REJECTED'
            """
        ),
    )

    op.execute(sa.text("CREATE TYPE deal_status_old AS ENUM ('NEW','REVIEW','CONFIRMED','PAID','COMPLETED')"))
    op.add_column(
        "deals",
        sa.Column(
            "status_old",
            postgresql.ENUM(
                "NEW",
                "REVIEW",
                "CONFIRMED",
                "PAID",
                "COMPLETED",
                name="deal_status_old",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            "UPDATE deals SET status_old = status::text::deal_status_old"
        ),
    )
    op.alter_column("deals", "status_old", nullable=False)
    op.drop_column("deals", "status")
    op.execute(sa.text("ALTER TABLE deals RENAME COLUMN status_old TO status"))
    op.execute(sa.text("DROP TYPE deal_status"))
    op.execute(sa.text("ALTER TYPE deal_status_old RENAME TO deal_status"))
    op.execute(sa.text("ALTER TABLE deals ALTER COLUMN status SET DEFAULT 'NEW'::deal_status"))
