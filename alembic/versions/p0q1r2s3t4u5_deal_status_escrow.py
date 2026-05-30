"""deal_status: add ESCROW_HELD and REFUNDED values

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-05-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p0q1r2s3t4u5"
down_revision: Union[str, None] = "o9p0q1r2s3t4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE требует commit вне транзакции для совместимости
    # со старыми версиями PostgreSQL (<= 11). 12+ поддерживает в транзакции.
    # ESCROW_HELD добавляется перед PAID, чтобы сохранить «красивый» порядок
    # значений PG-enum (линейный порядок переходов всё равно задаётся в Python
    # через _status_order, а не сортировкой PG).
    with op.get_context().autocommit_block():
        op.execute(
            sa.text(
                "ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'ESCROW_HELD' BEFORE 'PAID'"
            )
        )
        op.execute(sa.text("ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'REFUNDED'"))


def downgrade() -> None:
    # PostgreSQL не поддерживает удаление одного значения из enum напрямую.
    # Полное пересоздание типа deal_status небезопасно: от него зависит колонка
    # deals.status, и могут существовать сделки в статусах ESCROW_HELD/REFUNDED.
    # Поэтому downgrade — документированный no-op: значения остаются в типе
    # (паттерн как в m7n8o9p0q1r2).
    pass
