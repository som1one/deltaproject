"""marketplace payment settings + order payment_reported_at

Revision ID: aa1b2c3d4e5f
Revises: z0a1b2c3d4e5
Create Date: 2026-07-05

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, None] = "z0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Singleton-настройки приёма оплаты маркетплейса: карта админа для
    # ручных переводов + ключи ЮKassa, задаваемые из админ-панели.
    op.create_table(
        "marketplace_payment_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_number", sa.String(length=19), nullable=True),
        sa.Column("card_holder", sa.String(length=255), nullable=True),
        sa.Column("card_bank", sa.String(length=255), nullable=True),
        sa.Column("sbp_phone", sa.String(length=20), nullable=True),
        sa.Column("yookassa_shop_id", sa.String(length=80), nullable=True),
        sa.Column("yookassa_secret_key", sa.String(length=255), nullable=True),
        sa.Column("yookassa_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Отметка «клиент сообщил об оплате» на заказе маркетплейса.
    op.add_column(
        "marketplace_orders",
        sa.Column("payment_reported_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("marketplace_orders", "payment_reported_at")
    op.drop_table("marketplace_payment_settings")
