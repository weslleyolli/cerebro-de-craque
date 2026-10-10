from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

Category = Literal["ataque", "defesa", "transicao"]
Grade = Literal["best", "ok", "bad", "late"]
OptionGrade = Literal["best", "ok", "bad"]
OptionType = Literal[
    "passe", "chute", "drible", "conducao", "proteger", "posicao", "pressao", "atitude"
]
# Comportamento automático de um marcador na visão 3D.
# "cercar": balanço defensivo, acompanha a bola de um lado para o outro.
AiRole = Literal["cercar"]
# A criança é sempre ala (esquerdo ou direito).
WINGER_TAGS = ("AE", "AD")
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
    # Câmera lenta ("bullet time"): o trecho dura ms / slow. Ex.: 0.3 = 3x mais lento.
    slow: float | None = Field(default=None, gt=0, le=1)


class StartState(BaseModel):
    positions: dict[str, Point]
    ball: str


class View(BaseModel):
    top: float
    bottom: float


class Option(BaseModel):
    type: OptionType
    label: str
    # Texto curto do holograma na quadra 3D (ex.: "Tocar de primeira").
    short: str | None = None
    target: str | None = None
    hint: Point | None = None
    grade: OptionGrade
    result: str
    kind: OutcomeKind
    why: str
    frames: list[Frame] = Field(min_length=1)


class Awareness(BaseModel):
    """O que a criança precisava ver antes de receber: um jogador ou um ponto da quadra."""

    see: str | Point
    label: str


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
    # Marcadores que vêm pressionar a criança (zona vermelha na pausa).
    threats: list[str] = []
    # Comportamento automático dos marcadores (balanço defensivo).
    ai: dict[str, AiRole] = {}
    # Jogadores altos, que tapam mais a visão (ex.: o pivô adversário).
    tall: list[str] = []
    # O que a criança precisava ter visto antes da bola chegar.
    aware: Awareness | None = None


class ScenarioIn(ScenarioBase):
    """Valida uma jogada antes de entrar no banco."""

    @model_validator(mode="after")
    def _check(self) -> "ScenarioIn":
        ids = set(self.start.positions) | {"gk", "o0"}
        if "v" not in ids:
            raise ValueError("a jogada precisa do jogador 'v' (você)")
        if self.tags.get("v") not in WINGER_TAGS:
            raise ValueError("a criança ('v') precisa ser ala: tags.v deve ser AE ou AD")
        if sum(o.grade == "best" for o in self.options) != 1:
            raise ValueError("a jogada precisa de exatamente uma opção 'best'")
        frames = list(self.intro) + [f for o in self.options for f in o.frames]
        refs = {self.start.ball} | {o.target for o in self.options if o.target}
        refs |= set(self.threats) | set(self.ai) | set(self.tall)
        if self.aware and isinstance(self.aware.see, str):
            refs.add(self.aware.see)
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
    # Realces táticos na pausa (zona vermelha, corredor verde, companheiros brilhando).
    hints: bool = True


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
    # Aceita qualquer duração; o servidor guarda no máximo MAX_DECISION_MS.
    decision_ms: int = Field(ge=0, le=86_400_000)
    # Visão 3D: quantas vezes olhou em volta antes da bola chegar, e se tinha visto
    # o que importava (scenario.aware). None quando jogou sem a visão 3D.
    scans: int | None = Field(default=None, ge=0, le=200)
    aware: bool | None = None


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
    scans: int | None = None
    aware: bool | None = None
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
    # Escaneamento (só lances jogados na visão 3D).
    avg_scans: float | None = None
    aware_rate: float | None = None


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
    scans: int | None = None
    aware: bool | None = None
    created_at: datetime
    # Lidos da jogada no banco, mesmo que ela já tenha saído do app.
    scenario_title: str | None = None
    # None quando o tempo acabou.
    option_label: str | None = None


class StatsOut(BaseModel):
    player_id: int
    total_attempts: int
    best_count: int
    points: int
    avg_decision_ms: int | None
    best_streak: int
    # Escaneamento: média de olhadas antes de receber e % de vezes que viu o lance.
    avg_scans: float | None = None
    aware_rate: float | None = None
    categories: list[CategoryStats]
    scenarios: list[ScenarioStats]
    medals: list[MedalOut]
    diagnosis: Diagnosis | None
    recent: list[RecentAttempt]
