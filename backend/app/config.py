from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "somente-desenvolvimento-troque-este-segredo"
# Só nestes ambientes a API aceita o segredo de exemplo.
INSECURE_OK = ("development", "test")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://craque:craque@localhost:5432/craque"
    environment: str = "development"
    jwt_secret: str = DEFAULT_SECRET
    jwt_expire_minutes: int = 60 * 24 * 30
    cors_origins: list[str] = ["http://localhost:5173"]
    seed_on_startup: bool = True

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
