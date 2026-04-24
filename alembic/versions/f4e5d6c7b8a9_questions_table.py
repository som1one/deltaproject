"""questions table for public /question endpoint

Revision ID: f4e5d6c7b8a9
Revises: c2d3e4f5a6b7
Create Date: 2026-04-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f4e5d6c7b8a9"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("telegram", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_questions_telegram", "questions", ["telegram"], unique=False)
    op.create_index("ix_questions_created_at", "questions", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_questions_created_at", table_name="questions")
    op.drop_index("ix_questions_telegram", table_name="questions")
    op.drop_table("questions")
