"""user_role: add Tech_Admin value

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-05-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m7n8o9p0q1r2"
down_revision: Union[str, None] = "l6m7n8o9p0q1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE требует commit вне транзакции для совместимости
    # со старыми версиями PostgreSQL (<= 11). 12+ поддерживает в транзакции.
    with op.get_context().autocommit_block():
        op.execute(sa.text("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Tech_Admin'"))


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление одного значения из enum напрямую.
    # Полное пересоздание типа user_role небезопасно: от него зависят колонка
    # users.role и частичный уникальный индекс uq_users_single_admin, а также
    # могут существовать пользователи с ролью Tech_Admin. Поэтому downgrade —
    # документированный no-op: значение enum остаётся в типе.
    pass
