"""support ticket topics: nullable order_id + subject

Revision ID: cc3d4e5f6a72
Revises: bb2c3d4e5f61
Create Date: 2026-07-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "cc3d4e5f6a72"
down_revision: Union[str, None] = "bb2c3d4e5f61"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Тема обращения; существующие тикеты — споры по сделке.
    op.add_column(
        "support_tickets",
        sa.Column(
            "subject",
            sa.String(length=20),
            server_default=sa.text("'dispute'"),
            nullable=False,
        ),
    )
    # Общие вопросы могут создаваться без привязки к сделке.
    op.alter_column(
        "support_tickets",
        "order_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    # Тикеты без сделки нельзя вернуть в NOT NULL — удаляем их перед откатом.
    op.execute("DELETE FROM support_tickets WHERE order_id IS NULL")
    op.alter_column(
        "support_tickets",
        "order_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.drop_column("support_tickets", "subject")
