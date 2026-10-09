from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import SessionLocal
from app.routers import auth, players, scenarios
from app.seed import load_scenarios, upsert_scenarios


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.check()
    if settings.seed_on_startup:
        with SessionLocal() as db:
            upsert_scenarios(db, load_scenarios())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Cérebro de Craque API",
        description="Jogadas, decisões e estatísticas de leitura de jogo no futsal.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(scenarios.router)
    app.include_router(players.router)

    @app.get("/api/health", tags=["sistema"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
