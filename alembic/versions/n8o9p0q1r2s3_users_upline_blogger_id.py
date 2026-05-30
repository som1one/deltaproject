"""users: add upline_blogger_id with safe backfill

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-05-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "n8o9p0q1r2s3"
down_revision: Union[str, None] = "m7n8o9p0q1r2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("upline_blogger_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_upline_blogger_id_users",
        "users",
        "users",
        ["upline_blogger_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_users_upline_blogger_id",
        "users",
        ["upline_blogger_id"],
        unique=False,
    )

    # Безопасный бэкофилл: наставник-аплайн назначается только для валидных
    # аплайнов — блогер ссылается через linked_to на существующего Bloger,
    # отличного от себя. Прочие записи остаются NULL (наставник по умолчанию
    # не назначается).
    op.execute(
        sa.text(
            """
            UPDATE users u
            SET upline_blogger_id = u.linked_to
            WHERE u.role = 'Bloger'
              AND u.linked_to IS NOT NULL
              AND u.linked_to <> u.id
              AND EXISTS (
                  SELECT 1 FROM users m
                  WHERE m.id = u.linked_to AND m.role = 'Bloger'
              )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_users_upline_blogger_id", table_name="users")
    op.drop_constraint("fk_users_upline_blogger_id_users", "users", type_="foreignkey")
    op.drop_column("users", "upline_blogger_id")
