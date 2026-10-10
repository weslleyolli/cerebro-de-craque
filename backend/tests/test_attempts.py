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
    # Opção 1 de ala-primeira é "Dominar e girar para dentro": arriscada.
    a = post(client, auth, player_id, "ala-primeira", 1)
    assert a["grade"] == "bad" and a["points"] == 0

    a = post(client, auth, player_id, "ala-primeira", 0, ms=2500)
    assert a["grade"] == "best" and a["points"] == 3
    assert {m["id"] for m in a["new_medals"]} == {"primeira", "rapido"}


def test_timeout_and_invalid_option(client, auth, player_id):
    a = post(client, auth, player_id, "ala-parede", None, ms=8000)
    assert a["grade"] == "late"
    r = client.post(
        f"/api/players/{player_id}/attempts",
        json={"scenario_id": "ala-linha", "option_index": 3, "decision_ms": 1000},
        headers=auth,
    )
    assert r.status_code == 422  # a jogada "ala-linha" só tem 3 opções


def test_stats_and_medals(client, auth, player_id):
    for sid in ("ala-primeira", "ala-girar", "ala-parede"):
        post(client, auth, player_id, sid, best_index(client, sid), ms=4000)
    post(client, auth, player_id, "ala-infiltracao", 1, ms=5000)  # sai na bola: arriscada
    post(client, auth, player_id, "ala-linha", 2, ms=6000)  # recua: dá para melhorar

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
        "avg_scans": None,
        "aware_rate": None,
    }

    earned = {m["id"] for m in s["medals"] if m["earned"]}
    assert earned == {"primeira", "seq3", "camisa10"}

    d = s["diagnosis"]
    assert d["strongest"] == "ataque"
    assert d["weakest"] == "defesa"
    assert d["weakest_scenario_id"] == "ala-infiltracao"
    assert d["unplayed"] == ["transicao"]

    assert s["recent"][0]["scenario_id"] == "ala-linha"  # mais recente primeiro


def test_reset(client, auth, player_id):
    post(client, auth, player_id, "ala-primeira", 0)
    r = client.delete(f"/api/players/{player_id}/attempts", headers=auth)
    assert r.status_code == 204
    s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    assert s["total_attempts"] == 0
    assert s["diagnosis"] is None


def test_long_decision_is_kept_and_capped(client, auth, player_id):
    # Sem pausa com tempo, a criança pode largar o aparelho: a decisão vale mesmo assim.
    a = post(client, auth, player_id, "ala-primeira", 0, ms=125_000)
    assert a["decision_ms"] == 120_000


def test_stats_survive_a_deactivated_scenario(client, auth, player_id):
    """Tirar do app uma jogada já jogada não pode quebrar as estatísticas."""
    from sqlalchemy import text

    from app.db import engine

    post(client, auth, player_id, "ala-primeira", best_index(client, "ala-primeira"))
    post(client, auth, player_id, "ala-infiltracao", best_index(client, "ala-infiltracao"))
    post(client, auth, player_id, "ala-saida", 1)  # transição: arriscada
    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE scenarios SET active = false WHERE id = 'ala-saida'"))
        r = client.get(f"/api/players/{player_id}/stats", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["diagnosis"]["weakest_scenario_id"] is None
        assert "ala-saida" not in {s["scenario_id"] for s in r.json()["scenarios"]}
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE scenarios SET active = true WHERE id = 'ala-saida'"))


def test_medal_is_not_taken_back_when_a_play_is_added(client, auth, player_id):
    """Camisa 10 pede todos os lances de ataque; uma jogada nova não tira a medalha."""
    from sqlalchemy import text

    from app.db import engine

    for sid in ("ala-primeira", "ala-girar", "ala-parede"):
        post(client, auth, player_id, sid, best_index(client, sid))
    before = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    camisa = next(m for m in before["medals"] if m["id"] == "camisa10")
    assert camisa["earned"]

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO scenarios (id, category, concept, title, sort_order, setup, ask,"
                " lesson, view, tags, face, start, intro, options, active)"
                " SELECT 'ataque-novo', category, concept, title, 99, setup, ask, lesson, view,"
                " tags, face, start, intro, options, true FROM scenarios WHERE id = 'ala-primeira'"
            )
        )
    try:
        after = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
        camisa_after = next(m for m in after["medals"] if m["id"] == "camisa10")
        assert camisa_after["earned"] is True
        assert camisa_after["earned_at"] == camisa["earned_at"]

        # Dominar a jogada nova não comemora de novo uma medalha que já era dela.
        a = post(client, auth, player_id, "ataque-novo", best_index(client, "ataque-novo"))
        assert "camisa10" not in {m["id"] for m in a["new_medals"]}
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM attempts WHERE scenario_id = 'ataque-novo'"))
            conn.execute(text("DELETE FROM scenarios WHERE id = 'ataque-novo'"))


def test_reset_also_clears_medals(client, auth, player_id):
    post(client, auth, player_id, "ala-primeira", 0)
    client.delete(f"/api/players/{player_id}/attempts", headers=auth)
    s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    assert not any(m["earned"] for m in s["medals"])


def test_scanning_is_stored_and_summarized(client, auth, player_id):
    """A visão 3D manda quantas vezes olhou em volta e se viu o que importava."""
    r = client.post(
        f"/api/players/{player_id}/attempts",
        json={
            "scenario_id": "ala-primeira",
            "option_index": best_index(client, "ala-primeira"),
            "decision_ms": 2400,
            "scans": 4,
            "aware": True,
        },
        headers=auth,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["scans"] == 4 and body["aware"] is True
    # Olhou 3+ vezes e acertou: medalha "Radar ligado".
    assert "radar" in {m["id"] for m in body["new_medals"]}

    post(client, auth, player_id, "ala-girar", 1)  # sem visão 3D: não entra na média
    client.post(
        f"/api/players/{player_id}/attempts",
        json={
            "scenario_id": "ala-parede",
            "option_index": 1,
            "decision_ms": 3000,
            "scans": 0,
            "aware": False,
        },
        headers=auth,
    )
    s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
    assert s["avg_scans"] == 2.0
    assert s["aware_rate"] == 0.5
    ataque = next(c for c in s["categories"] if c["category"] == "ataque")
    assert ataque["avg_scans"] == 2.0
    assert s["recent"][0]["scans"] == 0
    assert s["recent"][1]["scans"] is None


def test_attempt_on_a_deactivated_play_is_still_recorded(client, auth, player_id):
    """Depois de um deploy, o aparelho pode ainda ter a lista antiga de lances.

    A jogada que saiu do app continua no banco: a decisão vale, com a nota do banco.
    Só um id que nunca existiu é recusado.
    """
    from sqlalchemy import text

    from app.db import engine

    best = best_index(client, "ala-saida")
    with engine.begin() as conn:
        conn.execute(text("UPDATE scenarios SET active = false WHERE id = 'ala-saida'"))
    try:
        a = post(client, auth, player_id, "ala-saida", best)
        assert a["grade"] == "best" and a["points"] == 3
        r = client.post(
            f"/api/players/{player_id}/attempts",
            json={"scenario_id": "nao-existe", "option_index": 0, "decision_ms": 1000},
            headers=auth,
        )
        assert r.status_code == 404
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE scenarios SET active = true WHERE id = 'ala-saida'"))


def test_recent_keeps_title_and_choice_of_a_deactivated_play(client, auth, player_id):
    """Os pais veem o nome do lance e a escolha mesmo depois que a jogada sai do app."""
    from sqlalchemy import text

    from app.db import engine

    play = client.get("/api/scenarios/ala-saida").json()
    post(client, auth, player_id, "ala-saida", 1)
    post(client, auth, player_id, "ala-saida", None, ms=8000)  # tempo esgotado
    with engine.begin() as conn:
        conn.execute(text("UPDATE scenarios SET active = false WHERE id = 'ala-saida'"))
    try:
        s = client.get(f"/api/players/{player_id}/stats", headers=auth).json()
        late, chosen = s["recent"]
        assert chosen["scenario_title"] == play["title"]
        assert chosen["option_label"] == play["options"][1]["label"]
        assert late["scenario_title"] == play["title"]
        assert late["option_label"] is None
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE scenarios SET active = true WHERE id = 'ala-saida'"))
