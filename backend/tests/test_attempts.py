def post(client, auth, pid, scenario_id, option_index, ms=2000):
    r = client.post(
        f"/api/players/{pid}/attempts",
        json={"scenario_id": scenario_id, "option_index": option_index, "decision_ms": ms},
        headers=auth,
    )
    assert r.status_code == 201, r.text
    return r.json()


def best_index(client, scenario_id):
    options = client.get(f"/api/scenarios/{scenario_id}").json()["options"]
    return next(i for i, o in enumerate(options) if o["grade"] == "best")


def test_grade_comes_from_server(client, auth, player_id):
    # Opção 1 do 2x1 é "Chutar de longe": arriscada.
    a = post(client, auth, player_id, "2x1", 1)
    assert a["grade"] == "bad" and a["points"] == 0

    a = post(client, auth, player_id, "2x1", 0, ms=2500)
    assert a["grade"] == "best" and a["points"] == 3
    assert {m["id"] for m in a["new_medals"]} == {"primeira", "rapido"}


def test_timeout_and_invalid_option(client, auth, player_id):
    a = post(client, auth, player_id, "pivo", None, ms=8000)
    assert a["grade"] == "late"
    r = client.post(
        f"/api/players/{player_id}/attempts",
        json={"scenario_id": "linha", "option_index": 3, "decision_ms": 1000},
        headers=auth,
    )
    assert r.status_code == 422  # a jogada "linha" só tem 3 opções


def test_stats_and_medals(client, auth, player_id):
    for sid in ("2x1", "tabela", "pivo"):
        post(client, auth, player_id, sid, best_index(client, sid), ms=4000)
    post(client, auth, player_id, "cobertura", 1, ms=5000)  # dobra a marcação: arriscada
    post(client, auth, player_id, "linha", 2, ms=6000)  # recua: dá para melhorar

    s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    assert s["total_attempts"] == 5
    assert s["best_count"] == 3
    assert s["points"] == 3 * 3 + 0 + 1
    assert s["best_streak"] == 3
    assert s["avg_decision_ms"] == 4600

    cats = {c["category"]: c for c in s["categories"]}
    assert cats["ataque"]["best"] == 3
    assert cats["defesa"] == {
        "category": "defesa",
        "attempts": 2,
        "best": 0,
        "ok": 1,
        "bad": 1,
        "timeouts": 0,
        "avg_decision_ms": 5500,
    }

    earned = {m["id"] for m in s["medals"] if m["earned"]}
    assert earned == {"primeira", "seq3", "camisa10"}

    d = s["diagnosis"]
    assert d["strongest"] == "ataque"
    assert d["weakest"] == "defesa"
    assert d["weakest_scenario_id"] == "cobertura"
    assert d["unplayed"] == ["transicao"]

    assert s["recent"][0]["scenario_id"] == "linha"  # mais recente primeiro


def test_reset(client, auth, player_id):
    post(client, auth, player_id, "2x1", 0)
    r = client.delete(f"/api/players/{player_id}/attempts", headers=auth)
    assert r.status_code == 204
    s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    assert s["total_attempts"] == 0
    assert s["diagnosis"] is None
