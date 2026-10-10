"""escaneamento: campos da visão 3D nas jogadas e nas decisões

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("scenarios", sa.Column("threats", JSONB, server_default="[]", nullable=False))
    op.add_column("scenarios", sa.Column("ai", JSONB, server_default="{}", nullable=False))
    op.add_column("scenarios", sa.Column("tall", JSONB, server_default="[]", nullable=False))
    op.add_column("scenarios", sa.Column("aware", JSONB, nullable=True))
    op.add_column("attempts", sa.Column("scans", sa.Integer(), nullable=True))
    op.add_column("attempts", sa.Column("aware", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("attempts", "aware")
    op.drop_column("attempts", "scans")
    op.drop_column("scenarios", "aware")
    op.drop_column("scenarios", "tall")
    op.drop_column("scenarios", "ai")
    op.drop_column("scenarios", "threats")
