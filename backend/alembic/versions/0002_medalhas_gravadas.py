"""medalhas gravadas por jogador

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "player_medals",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("medal_id", sa.String(length=20), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("player_id", "medal_id"),
    )


def downgrade() -> None:
    op.drop_table("player_medals")
