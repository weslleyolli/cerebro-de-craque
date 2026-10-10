from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings

_url = get_settings().database_url
# Conexão "pooled" do Neon (host com -pooler) passa pelo PgBouncer em modo
# transação. Por precaução, o psycopg não prepara comandos nesse caso; o README
# recomenda a conexão direta.
_connect_args = {"prepare_threshold": None} if "-pooler." in _url else {}
engine = create_engine(_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
