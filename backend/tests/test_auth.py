from tests.conftest import signup


def test_register_login_me(client):
    headers = signup(client)
    assert client.get("/api/auth/me", headers=headers).json()["email"] == "pai@example.com"

    r = client.post(
        "/api/auth/login", json={"email": "PAI@example.com", "password": "senha-forte-123"}
    )
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Weslley"


def test_duplicate_email_is_rejected(client):
    signup(client)
    r = client.post(
        "/api/auth/register",
        json={"name": "Outro", "email": "Pai@Example.com", "password": "outra-senha-123"},
    )
    assert r.status_code == 409


def test_wrong_password(client):
    signup(client)
    r = client.post("/api/auth/login", json={"email": "pai@example.com", "password": "errada-123"})
    assert r.status_code == 401


def test_short_password(client):
    r = client.post(
        "/api/auth/register", json={"name": "X", "email": "x@example.com", "password": "123"}
    )
    assert r.status_code == 422


def test_protected_routes_need_token(client):
    assert client.get("/api/players").status_code == 401
    assert client.get("/api/players", headers={"Authorization": "Bearer lixo"}).status_code == 401
