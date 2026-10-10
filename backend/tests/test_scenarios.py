import json

import pytest

from app.schemas import ScenarioIn
from app.seed import DATA_FILE, load_scenarios


def test_list_is_public_and_ordered(client):
    r = client.get("/api/scenarios")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 9
    assert [s["sort_order"] for s in data] == sorted(s["sort_order"] for s in data)
    assert {s["category"] for s in data} == {"ataque", "defesa", "transicao"}


def test_get_one(client):
    r = client.get("/api/scenarios/ala-linha")
    assert r.status_code == 200
    assert r.json()["concept"] == "Linha de passe"
    assert client.get("/api/scenarios/nao-existe").status_code == 404


def test_seed_file_is_valid():
    assert len(load_scenarios()) == 9


def _first() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))[0]


def test_validation_requires_exactly_one_best():
    raw = _first()
    raw["options"][1]["grade"] = "best"
    with pytest.raises(ValueError, match="exatamente uma"):
        ScenarioIn.model_validate(raw)


def test_validation_catches_unknown_player():
    raw = _first()
    raw["options"][0]["target"] = "a9"
    with pytest.raises(ValueError, match="desconhecidos"):
        ScenarioIn.model_validate(raw)


def test_diagnosis_without_candidate_scenario():
    """Categoria mais fraca só com tentativas em jogadas que saíram do app."""
    from app.schemas import CategoryStats
    from app.stats import diagnose

    cats = [
        CategoryStats(
            category="ataque", attempts=2, best=2, ok=0, bad=0, timeouts=0, avg_decision_ms=1000
        ),
        CategoryStats(
            category="defesa", attempts=0, best=0, ok=0, bad=0, timeouts=0, avg_decision_ms=None
        ),
        CategoryStats(
            category="transicao", attempts=1, best=0, ok=0, bad=1, timeouts=0, avg_decision_ms=1000
        ),
    ]
    d = diagnose(cats, [], total=3)
    assert d is not None
    assert d.weakest == "transicao"
    assert d.weakest_scenario_id is None


def test_only_wingers():
    """A criança é sempre ala: uma jogada com ela de pivô não entra."""
    raw = _first()
    raw["tags"]["v"] = "P"
    with pytest.raises(ValueError, match="ala"):
        ScenarioIn.model_validate(raw)


def test_new_scenario_fields_are_served(client):
    s = client.get("/api/scenarios/ala-primeira").json()
    assert s["threats"] == ["o2"]
    assert s["ai"] == {"o3": "cercar", "o4": "cercar"}
    assert s["aware"] == {"see": "a1", "label": "o pivô livre"}
    assert any(f.get("slow") for f in s["intro"])
    assert s["options"][0]["short"] == "Tocar de primeira"


def test_seed_deactivates_plays_removed_from_the_file(client):
    """Jogada que saiu do arquivo some do app, mas fica no banco com o histórico."""
    from sqlalchemy import text

    from app.db import SessionLocal, engine
    from app.seed import upsert_scenarios

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO scenarios (id, category, concept, title, sort_order, setup, ask,"
                " lesson, view, tags, face, start, intro, options, active)"
                " SELECT 'jogada-antiga', category, concept, title, 99, setup, ask, lesson, view,"
                " tags, face, start, intro, options, true FROM scenarios WHERE id = 'ala-primeira'"
            )
        )
    try:
        assert client.get("/api/scenarios/jogada-antiga").status_code == 200
        with SessionLocal() as db:
            upsert_scenarios(db, load_scenarios())
        assert client.get("/api/scenarios/jogada-antiga").status_code == 404
        assert len(client.get("/api/scenarios").json()) == 9
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM scenarios WHERE id = 'jogada-antiga'"))
