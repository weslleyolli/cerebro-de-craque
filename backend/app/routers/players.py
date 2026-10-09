from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import delete, select

from app.deps import CurrentUser, DbSession, OwnedPlayer
from app.models import Attempt, Player, Scenario
from app.schemas import AttemptIn, AttemptOut, PlayerIn, PlayerOut, PlayerPatch, StatsOut
from app.stats import POINTS, AttemptRow, ScenarioRow, compute_stats, medals

router = APIRouter(prefix="/api/players", tags=["jogadores"])

MAX_PLAYERS = 10


@router.get("", response_model=list[PlayerOut])
def list_players(user: CurrentUser) -> list[Player]:
    return user.players


@router.post("", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
def create_player(body: PlayerIn, user: CurrentUser, db: DbSession) -> Player:
    if len(user.players) >= MAX_PLAYERS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Limite de {MAX_PLAYERS} jogadores.")
    player = Player(owner_id=user.id, name=body.name, settings=body.settings.model_dump())
    db.add(player)
    db.commit()
    return player


@router.patch("/{player_id}", response_model=PlayerOut)
def update_player(body: PlayerPatch, player: OwnedPlayer, db: DbSession) -> Player:
    if body.name is not None:
        player.name = body.name
    if body.settings is not None:
        player.settings = body.settings.model_dump()
    db.commit()
    return player


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(player: OwnedPlayer, db: DbSession) -> Response:
    db.delete(player)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Decisões ----------


def _history(db: DbSession, player_id: int) -> tuple[list[AttemptRow], list[ScenarioRow]]:
    rows = db.execute(
        select(Attempt, Scenario.category)
        .join(Scenario, Scenario.id == Attempt.scenario_id)
        .where(Attempt.player_id == player_id)
        .order_by(Attempt.created_at, Attempt.id)
    ).all()
    attempts = [
        AttemptRow(
            id=a.id,
            scenario_id=a.scenario_id,
            category=cat,
            option_index=a.option_index,
            grade=a.grade,
            decision_ms=a.decision_ms,
            created_at=a.created_at,
        )
        for a, cat in rows
    ]
    scenarios = [
        ScenarioRow(id=s.id, category=s.category)
        for s in db.scalars(
            select(Scenario).where(Scenario.active).order_by(Scenario.sort_order, Scenario.id)
        )
    ]
    return attempts, scenarios


@router.post(
    "/{player_id}/attempts", response_model=AttemptOut, status_code=status.HTTP_201_CREATED
)
def record_attempt(body: AttemptIn, player: OwnedPlayer, db: DbSession) -> AttemptOut:
    scenario = db.get(Scenario, body.scenario_id)
    if scenario is None or not scenario.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogada não encontrada.")

    # A nota vem do banco de jogadas, nunca do aparelho.
    if body.option_index is None:
        grade = "late"
    elif body.option_index < len(scenario.options):
        grade = scenario.options[body.option_index]["grade"]
    else:
        raise HTTPException(422, "Opção inexistente.")

    before, scenarios = _history(db, player.id)
    earned_before = {m.id for m in medals(before, scenarios) if m.earned}

    attempt = Attempt(
        player_id=player.id,
        scenario_id=scenario.id,
        option_index=body.option_index,
        grade=grade,
        decision_ms=body.decision_ms,
    )
    db.add(attempt)
    db.commit()

    after, _ = _history(db, player.id)
    new_medals = [m for m in medals(after, scenarios) if m.earned and m.id not in earned_before]

    return AttemptOut(
        id=attempt.id,
        scenario_id=attempt.scenario_id,
        option_index=attempt.option_index,
        grade=grade,
        points=POINTS[grade],
        decision_ms=attempt.decision_ms,
        created_at=attempt.created_at,
        new_medals=new_medals,
    )


@router.get("/{player_id}/stats", response_model=StatsOut)
def player_stats(player: OwnedPlayer, db: DbSession) -> StatsOut:
    attempts, scenarios = _history(db, player.id)
    return compute_stats(player.id, attempts, scenarios)


@router.delete("/{player_id}/attempts", status_code=status.HTTP_204_NO_CONTENT)
def reset_attempts(player: OwnedPlayer, db: DbSession) -> Response:
    db.execute(delete(Attempt).where(Attempt.player_id == player.id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
