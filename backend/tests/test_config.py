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
