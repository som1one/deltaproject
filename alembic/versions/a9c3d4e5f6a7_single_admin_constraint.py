"""enforce single admin user

Revision ID: a9c3d4e5f6a7
Revises: e7f8a9b0c1d2
Create Date: 2026-03-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DO $$
            DECLARE admins_count integer;
            BEGIN
              SELECT COUNT(*) INTO admins_count FROM users WHERE role = 'Admin';
              IF admins_count > 1 THEN
                RAISE EXCEPTION 'Найдено % администраторов. Перед миграцией должен остаться только один.', admins_count;
              END IF;
            END $$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_admin
            ON users (role)
            WHERE role = 'Admin'
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_users_single_admin"))
