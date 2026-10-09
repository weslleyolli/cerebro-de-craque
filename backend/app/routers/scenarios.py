from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.deps import DbSession
from app.models import Scenario
from app.schemas import ScenarioOut

router = APIRouter(prefix="/api/scenarios", tags=["jogadas"])


@router.get("", response_model=list[ScenarioOut])
def list_scenarios(db: DbSession) -> list[Scenario]:
    stmt = select(Scenario).where(Scenario.active).order_by(Scenario.sort_order, Scenario.id)
    return list(db.scalars(stmt))


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(scenario_id: str, db: DbSession) -> Scenario:
    scenario = db.get(Scenario, scenario_id)
    if scenario is None or not scenario.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogada não encontrada.")
    return scenario
