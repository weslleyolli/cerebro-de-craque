import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_SECRET = "somente-desenvolvimento-troque-este-segredo"
# Só nestes ambientes a API aceita o segredo de exemplo.
INSECURE_OK = ("development", "test")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://craque:craque@localhost:5432/craque"
    environment: str = "development"
    jwt_secret: str = DEFAULT_SECRET
    jwt_expire_minutes: int = 60 * 24 * 30
    # Aceita JSON (["https://a", "https://b"]) ou lista separada por vírgula.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    seed_on_startup: bool = True
    # Tentativas de login/cadastro por IP a cada minuto.
    auth_rate_limit_per_minute: int = 10

    @field_validator("database_url")
    @classmethod
    def _use_psycopg(cls, url: str) -> str:
        """Neon e Render entregam postgres:// ou postgresql://; o SQLAlchemy precisa do driver."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [o.strip().rstrip("/") for o in text.split(",") if o.strip()]
        return value

    def check(self) -> None:
        weak = self.jwt_secret == DEFAULT_SECRET or len(self.jwt_secret) < 32
        if weak and self.environment not in INSECURE_OK:
            raise RuntimeError(
                f"JWT_SECRET fraco no ambiente '{self.environment}'. "
                "Defina um segredo com pelo menos 32 caracteres."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
