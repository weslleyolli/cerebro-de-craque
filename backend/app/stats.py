"""Pontos, medalhas e estatísticas de leitura de jogo.

Tudo aqui é função pura sobre listas, para ser testado sem banco.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from app.schemas import (
    CategoryStats,
    Diagnosis,
    MedalOut,
    RecentAttempt,
    ScenarioStats,
    StatsOut,
)

CATEGORY_ORDER = ("ataque", "defesa", "transicao")
POINTS = {"best": 3, "ok": 1, "bad": 0, "late": 0}
FAST_MS = 3000
RECENT_LIMIT = 15


@dataclass(frozen=True)
class AttemptRow:
    id: int
    scenario_id: str
    category: str
    option_index: int | None
    grade: str
    decision_ms: int
    created_at: datetime


@dataclass(frozen=True)
class ScenarioRow:
    id: str
    category: str


@dataclass
class Progress:
    """Situação acumulada das decisões, atualizada uma decisão por vez."""

    mastered: set[str] = field(default_factory=set)
    run: int = 0
    best_run: int = 0
    fast_best: bool = False

    def add(self, a: AttemptRow) -> None:
        if a.grade == "best":
            self.mastered.add(a.scenario_id)
            self.run += 1
            self.best_run = max(self.best_run, self.run)
            self.fast_best = self.fast_best or a.decision_ms < FAST_MS
        else:
            self.run = 0


@dataclass(frozen=True)
class Medal:
    id: str
    abbr: str
    name: str
    description: str
    test: Callable[[Progress, Sequence[ScenarioRow]], bool]


def best_streak(attempts: Sequence[AttemptRow]) -> int:
    p = Progress()
    for a in attempts:
        p.add(a)
    return p.best_run


def _category_mastered(category: str) -> Callable[[Progress, Sequence[ScenarioRow]], bool]:
    def test(p: Progress, scenarios: Sequence[ScenarioRow]) -> bool:
        ids = {s.id for s in scenarios if s.category == category}
        return bool(ids) and ids <= p.mastered

    return test


MEDALS: tuple[Medal, ...] = (
    Medal(
        "primeira",
        "1ª",
        "Primeira leitura",
        "Fez a primeira ótima leitura.",
        lambda p, s: bool(p.mastered),
    ),
    Medal(
        "seq3",
        "3x",
        "Três seguidas",
        "Três ótimas leituras em sequência.",
        lambda p, s: p.best_run >= 3,
    ),
    Medal(
        "rapido",
        "3s",
        "Pensa rápido",
        "Ótima leitura em menos de 3 segundos.",
        lambda p, s: p.fast_best,
    ),
    Medal(
        "camisa10",
        "10",
        "Camisa 10",
        "Acertou todos os lances de ataque.",
        _category_mastered("ataque"),
    ),
    Medal(
        "muralha",
        "MU",
        "Muralha",
        "Acertou todos os lances de defesa.",
        _category_mastered("defesa"),
    ),
    Medal(
        "ligado",
        "LI",
        "Ligado no lance",
        "Acertou todos os lances de transição.",
        _category_mastered("transicao"),
    ),
    Medal(
        "craque",
        "CC",
        "Cérebro de Craque",
        "Acertou todos os lances do app.",
        lambda p, s: bool(s) and {x.id for x in s} <= p.mastered,
    ),
)


def medals(attempts: Sequence[AttemptRow], scenarios: Sequence[ScenarioRow]) -> list[MedalOut]:
    """Medalhas com a data em que cada uma foi conquistada pela primeira vez."""
    earned_at: dict[str, datetime] = {}
    progress = Progress()
    for a in attempts:
        progress.add(a)
        for m in MEDALS:
            if m.id not in earned_at and m.test(progress, scenarios):
                earned_at[m.id] = a.created_at
    return [
        MedalOut(
            id=m.id,
            abbr=m.abbr,
            name=m.name,
            description=m.description,
            earned=m.id in earned_at,
            earned_at=earned_at.get(m.id),
        )
        for m in MEDALS
    ]


def _avg(values: list[int]) -> int | None:
    return round(sum(values) / len(values)) if values else None


def compute_stats(
    player_id: int, attempts: Sequence[AttemptRow], scenarios: Sequence[ScenarioRow]
) -> StatsOut:
    """`attempts` em ordem cronológica; `scenarios` são as jogadas ativas, na ordem do app."""
    answered = [a.decision_ms for a in attempts if a.grade != "late"]

    categories = []
    for cat in CATEGORY_ORDER:
        rows = [a for a in attempts if a.category == cat]
        categories.append(
            CategoryStats(
                category=cat,
                attempts=len(rows),
                best=sum(a.grade == "best" for a in rows),
                ok=sum(a.grade == "ok" for a in rows),
                bad=sum(a.grade in ("bad", "late") for a in rows),
                timeouts=sum(a.grade == "late" for a in rows),
                avg_decision_ms=_avg([a.decision_ms for a in rows if a.grade != "late"]),
            )
        )

    per_scenario = []
    for s in scenarios:
        rows = [a for a in attempts if a.scenario_id == s.id]
        best = sum(a.grade == "best" for a in rows)
        per_scenario.append(
            ScenarioStats(
                scenario_id=s.id,
                category=s.category,
                attempts=len(rows),
                best=best,
                last_grade=rows[-1].grade if rows else None,
                mastered=best > 0,
            )
        )

    return StatsOut(
        player_id=player_id,
        total_attempts=len(attempts),
        best_count=sum(a.grade == "best" for a in attempts),
        points=sum(POINTS[a.grade] for a in attempts),
        avg_decision_ms=_avg(answered),
        best_streak=best_streak(attempts),
        categories=categories,
        scenarios=per_scenario,
        medals=medals(attempts, scenarios),
        diagnosis=diagnose(categories, per_scenario, len(attempts)),
        recent=[
            RecentAttempt(
                id=a.id,
                scenario_id=a.scenario_id,
                option_index=a.option_index,
                grade=a.grade,
                decision_ms=a.decision_ms,
                created_at=a.created_at,
            )
            for a in reversed(attempts[-RECENT_LIMIT:])
        ],
    )


MIN_FOR_DIAGNOSIS = 3


def diagnose(
    categories: list[CategoryStats], scenarios: list[ScenarioStats], total: int
) -> Diagnosis | None:
    """Onde a criança lê melhor o jogo e onde tem mais dificuldade."""
    if total < MIN_FOR_DIAGNOSIS:
        return None
    played = [c for c in categories if c.attempts]
    rate = {c.category: c.best / c.attempts for c in played}
    strongest = max(played, key=lambda c: rate[c.category]).category
    weakest = min(played, key=lambda c: rate[c.category]).category
    if rate[weakest] == rate[strongest]:
        weakest = None

    weakest_scenario = None
    if weakest:
        candidates = [s for s in scenarios if s.category == weakest and s.attempts]
        weakest_scenario = min(candidates, key=lambda s: s.best / s.attempts).scenario_id

    return Diagnosis(
        strongest=strongest,
        weakest=weakest,
        weakest_scenario_id=weakest_scenario,
        unplayed=[c.category for c in categories if not c.attempts],
    )
