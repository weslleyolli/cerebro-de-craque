from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

CATEGORIES = ("ataque", "defesa", "transicao")
GRADES = ("best", "ok", "bad", "late")


class User(Base):
    """Responsável (pai, mãe ou treinador). É quem tem login."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    players: Mapped[list["Player"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", order_by="Player.id"
    )


class Player(Base):
    """Criança que treina. Um responsável pode ter vários jogadores."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=lambda: {"timed": False, "slow": False}
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User] = relationship(back_populates="players")


class Scenario(Base):
    """Uma jogada do banco: posições, animação, pergunta e opções.

    A geometria fica em JSONB porque é lida inteira pelo app e muda de forma
    junto com o editor de jogadas, sem precisar de migração a cada campo novo.
    """

    __tablename__ = "scenarios"
    __table_args__ = (CheckConstraint(f"category IN {CATEGORIES}", name="ck_scenarios_category"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    concept: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(120))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    setup: Mapped[str] = mapped_column(Text)
    ask: Mapped[str] = mapped_column(Text)
    lesson: Mapped[str] = mapped_column(Text)
    view: Mapped[dict[str, Any]] = mapped_column(JSONB)
    tags: Mapped[dict[str, Any]] = mapped_column(JSONB)
    face: Mapped[dict[str, Any]] = mapped_column(JSONB)
    start: Mapped[dict[str, Any]] = mapped_column(JSONB)
    intro: Mapped[list[Any]] = mapped_column(JSONB)
    options: Mapped[list[Any]] = mapped_column(JSONB)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Attempt(Base):
    """Uma decisão tomada na pausa tática. A nota é calculada no servidor."""

    __tablename__ = "attempts"
    __table_args__ = (
        CheckConstraint(f"grade IN {GRADES}", name="ck_attempts_grade"),
        Index("ix_attempts_player_created", "player_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id", ondelete="RESTRICT"))
    # None quando o tempo acabou antes da escolha.
    option_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade: Mapped[str] = mapped_column(String(8))
    decision_ms: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
