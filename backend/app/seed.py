"""Carrega as jogadas de app/data/scenarios.json no banco.

Rode com `uv run python -m app.seed`. É idempotente: atualiza as jogadas que
já existem pelo id, cria as novas e desativa (active = false) as que saíram do
arquivo. Nunca apaga jogadas, porque as decisões das crianças apontam para elas.
"""

import json
from pathlib import Path

from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Scenario
from app.schemas import ScenarioIn

DATA_FILE = Path(__file__).parent / "data" / "scenarios.json"


def load_scenarios(path: Path = DATA_FILE) -> list[ScenarioIn]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    scenarios = [ScenarioIn.model_validate(item) for item in raw]
    ids = [s.id for s in scenarios]
    if len(ids) != len(set(ids)):
        raise ValueError("ids de jogada repetidos em scenarios.json")
    return scenarios


def upsert_scenarios(db: Session, scenarios: list[ScenarioIn]) -> int:
    rows = [{**s.model_dump(mode="json"), "active": True} for s in scenarios]
    if not rows:
        return 0
    stmt = insert(Scenario).values(rows)
    updatable = {c: stmt.excluded[c] for c in rows[0] if c != "id"}
    stmt = stmt.on_conflict_do_update(
        index_elements=[Scenario.id], set_={**updatable, "updated_at": func.now()}
    )
    db.execute(stmt)
    # Jogada que saiu do arquivo sai do app, mas continua no banco com o histórico.
    db.execute(
        update(Scenario)
        .where(Scenario.id.not_in([r["id"] for r in rows]), Scenario.active)
        .values(active=False)
    )
    db.commit()
    return len(rows)


def main() -> None:
    with SessionLocal() as db:
        n = upsert_scenarios(db, load_scenarios())
    print(f"{n} jogadas carregadas.")


if __name__ == "__main__":
    main()
