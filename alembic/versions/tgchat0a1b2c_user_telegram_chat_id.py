"""users.telegram_chat_id: чат Telegram-бота для уведомлений

Revision ID: tgchat0a1b2c
Revises: e5f6a7b8c9d0
Create Date: 2026-08-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tgchat0a1b2c"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "telegram_chat_id")
