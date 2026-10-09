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
    r = client.get("/api/scenarios/cobertura")
    assert r.status_code == 200
    assert r.json()["concept"] == "Cobertura"
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
