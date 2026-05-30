"""ledger_entry_status: add escrow lifecycle values

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-05-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "q1r2s3t4u5v6"
down_revision: Union[str, None] = "p0q1r2s3t4u5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE требует commit вне транзакции для совместимости
    # со старыми версиями PostgreSQL (<= 11). 12+ поддерживает в транзакции.
    # Три значения жизненного цикла Удержания_Эскроу: активное удержание,
    # распределено, возвращено.
    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                "ALTER TYPE ledger_entry_status ADD VALUE IF NOT EXISTS 'escrow_held'"
            )
        )
        op.execute(
            sa.text(
                "ALTER TYPE ledger_entry_status ADD VALUE IF NOT EXISTS 'escrow_released'"
            )
        )
        op.execute(
            sa.text(
                "ALTER TYPE ledger_entry_status ADD VALUE IF NOT EXISTS 'escrow_refunded'"
            )
        )


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление одного значения из enum напрямую.
    # Полное пересоздание типа ledger_entry_status небезопасно: от него зависит
    # колонка ledger_entries.status, и могут существовать записи Удержания_Эскроу
    # в статусах escrow_held/escrow_released/escrow_refunded. Поэтому downgrade —
    # документированный no-op: значения остаются в типе (паттерн как в m7n8o9p0q1r2).
    pass
