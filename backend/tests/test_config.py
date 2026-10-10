import pytest

from app.config import DEFAULT_SECRET, Settings

STRONG = "x" * 40


@pytest.mark.parametrize("environment", ["production", "staging", "qualquer-coisa"])
def test_weak_secret_is_refused_outside_dev(environment):
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(environment=environment, jwt_secret=DEFAULT_SECRET).check()
    with pytest.raises(RuntimeError):
        Settings(environment=environment, jwt_secret="curto").check()
    Settings(environment=environment, jwt_secret=STRONG).check()


@pytest.mark.parametrize("environment", ["development", "test"])
def test_default_secret_is_fine_for_dev(environment):
    Settings(environment=environment, jwt_secret=DEFAULT_SECRET).check()


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:p@host/db?sslmode=require",
        "postgresql://u:p@host/db?sslmode=require",
        "postgresql+psycopg://u:p@host/db?sslmode=require",
    ],
)
def test_database_url_gets_the_psycopg_driver(url):
    """Neon e Render entregam a URL sem o driver; a API aceita como vier."""
    s = Settings(database_url=url)
    assert s.database_url == "postgresql+psycopg://u:p@host/db?sslmode=require"


def test_cors_origins_accept_json_or_comma_list(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://craque.netlify.app/, http://localhost:5173")
    assert Settings().cors_origins == ["https://craque.netlify.app", "http://localhost:5173"]
    monkeypatch.setenv("CORS_ORIGINS", '["https://craque.netlify.app"]')
    assert Settings().cors_origins == ["https://craque.netlify.app"]
