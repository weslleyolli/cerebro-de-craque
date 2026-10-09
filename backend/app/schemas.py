from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

Category = Literal["ataque", "defesa", "transicao"]
Grade = Literal["best", "ok", "bad", "late"]
OptionGrade = Literal["best", "ok", "bad"]
OptionType = Literal["passe", "chute", "drible", "proteger", "posicao", "pressao", "atitude"]
OutcomeKind = Literal["gol", "golcontra", "recupera", "posse", "perde", "neutro"]

# Ponto na quadra, em metros: x de 0 a 20 (largura), y de 0 a 40.
# y = 0 é o gol adversário; o time do jogador ataca para cima.
Point = Annotated[list[float], Field(min_length=2, max_length=2)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


# ---------- Jogadas ----------


class Frame(BaseModel):
    """Um trecho da animação: quem se move para onde, e com quem fica a bola."""

    ms: int = Field(gt=0, le=5000)
    moves: dict[str, Point] = {}
    # id do jogador que fica com a bola, ou um ponto (bola solta, chute, gol).
    ball: str | Point | None = None


class StartState(BaseModel):
    positions: dict[str, Point]
    ball: str


class View(BaseModel):
    top: float
    bottom: float


class Option(BaseModel):
    type: OptionType
    label: str
    target: str | None = None
    hint: Point | None = None
    grade: OptionGrade
    result: str
    kind: OutcomeKind
    why: str
    frames: list[Frame] = Field(min_length=1)


class ScenarioBase(BaseModel):
    id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9x-]{2,40}$")]
    category: Category
    concept: str
    title: str
    sort_order: int = 0
    setup: str
    ask: str
    lesson: str
    view: View
    tags: dict[str, str] = {}
    face: dict[str, Literal["up", "down"]] = {}
    start: StartState
    intro: list[Frame]
    options: list[Option] = Field(min_length=2, max_length=4)


class ScenarioIn(ScenarioBase):
    """Valida uma jogada antes de entrar no banco."""

    @model_validator(mode="after")
    def _check(self) -> "ScenarioIn":
        ids = set(self.start.positions) | {"gk", "o0"}
        if "v" not in ids:
            raise ValueError("a jogada precisa do jogador 'v' (você)")
        if sum(o.grade == "best" for o in self.options) != 1:
            raise ValueError("a jogada precisa de exatamente uma opção 'best'")
        frames = list(self.intro) + [f for o in self.options for f in o.frames]
        refs = {self.start.ball} | {o.target for o in self.options if o.target}
        for f in frames:
            refs |= set(f.moves)
            if isinstance(f.ball, str):
                refs.add(f.ball)
        unknown = refs - ids
        if unknown:
            raise ValueError(f"jogadores desconhecidos: {sorted(unknown)}")
        if self.view.bottom <= self.view.top:
            raise ValueError("view.bottom precisa ser maior que view.top")
        return self


class ScenarioOut(ScenarioBase):
    model_config = ConfigDict(from_attributes=True)


# ---------- Conta ----------


class RegisterIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


# ---------- Jogadores ----------


class PlayerSettings(BaseModel):
    timed: bool = False
    slow: bool = False


class PlayerIn(BaseModel):
    name: Name
    settings: PlayerSettings = PlayerSettings()


class PlayerPatch(BaseModel):
    name: Name | None = None
    settings: PlayerSettings | None = None


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    settings: PlayerSettings
    created_at: datetime


# ---------- Decisões e estatísticas ----------


class AttemptIn(BaseModel):
    scenario_id: str
    # None quando o tempo da pausa acabou.
    option_index: int | None = Field(default=None, ge=0, le=3)
    decision_ms: int = Field(ge=0, le=120_000)


class MedalOut(BaseModel):
    id: str
    abbr: str
    name: str
    description: str
    earned: bool
    earned_at: datetime | None = None


class AttemptOut(BaseModel):
    id: int
    scenario_id: str
    option_index: int | None
    grade: Grade
    points: int
    decision_ms: int
    created_at: datetime
    new_medals: list[MedalOut] = []


class CategoryStats(BaseModel):
    category: Category
    attempts: int
    best: int
    ok: int
    bad: int
    timeouts: int
    avg_decision_ms: int | None


class ScenarioStats(BaseModel):
    scenario_id: str
    category: Category
    attempts: int
    best: int
    last_grade: Grade | None
    mastered: bool


class Diagnosis(BaseModel):
    strongest: Category | None
    weakest: Category | None
    weakest_scenario_id: str | None
    unplayed: list[Category]


class RecentAttempt(BaseModel):
    id: int
    scenario_id: str
    option_index: int | None
    grade: Grade
    decision_ms: int
    created_at: datetime


class StatsOut(BaseModel):
    player_id: int
    total_attempts: int
    best_count: int
    points: int
    avg_decision_ms: int | None
    best_streak: int
    categories: list[CategoryStats]
    scenarios: list[ScenarioStats]
    medals: list[MedalOut]
    diagnosis: Diagnosis | None
    recent: list[RecentAttempt]
