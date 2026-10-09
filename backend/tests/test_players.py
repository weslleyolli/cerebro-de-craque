from tests.conftest import signup


def test_crud(client, auth):
    r = client.post("/api/players", json={"name": "  Davi  "}, headers=auth)
    assert r.status_code == 201
    p = r.json()
    assert p["name"] == "Davi"
    assert p["settings"] == {"timed": False, "slow": False}

    r = client.patch(
        f"/api/players/{p['id']}",
        json={"name": "Davizinho", "settings": {"timed": True, "slow": False}},
        headers=auth,
    )
    assert r.json()["name"] == "Davizinho"
    assert r.json()["settings"]["timed"] is True

    assert len(client.get("/api/players", headers=auth).json()) == 1
    assert client.delete(f"/api/players/{p['id']}", headers=auth).status_code == 204
    assert client.get("/api/players", headers=auth).json() == []


def test_cannot_touch_someone_elses_player(client, auth, player_id):
    other = signup(client, "outra@example.com")
    assert client.get(f"/api/players/{player_id}/stats", headers=other).status_code == 404
    assert (
        client.patch(
            f"/api/players/{player_id}", json={"name": "Hacker"}, headers=other
        ).status_code
        == 404
    )
    r = client.post(
        f"/api/players/{player_id}/attempts",
        json={"scenario_id": "2x1", "option_index": 0, "decision_ms": 1000},
        headers=other,
    )
    assert r.status_code == 404


def test_blank_name_is_rejected(client, auth):
    assert client.post("/api/players", json={"name": "   "}, headers=auth).status_code == 422
