from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_url = get_settings().database_url
# Conexão "pooled" do Neon passa pelo PgBouncer em modo transação, que não
# guarda prepared statements entre transações: o psycopg não pode prepará-los.
_connect_args = {"prepare_threshold": None} if "-pooler." in _url else {}
engine = create_engine(_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
