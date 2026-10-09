import os

os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+psycopg://craque:craque@localhost:5432/craque_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["SEED_ON_STARTUP"] = "true"

from collections.abc import Iterator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    """Banco de teste do zero, criado pelas migrações (assim elas também são testadas)."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:  # o lifespan carrega as jogadas
        yield c
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE attempts, players, users RESTART IDENTITY CASCADE"))


def signup(client: TestClient, email: str = "pai@example.com") -> dict[str, str]:
    r = client.post(
        "/api/auth/register",
        json={"name": "Weslley", "email": email, "password": "senha-forte-123"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    return signup(client)


@pytest.fixture
def player_id(client: TestClient, auth: dict[str, str]) -> int:
    r = client.post("/api/players", json={"name": "Davi"}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()["id"]
