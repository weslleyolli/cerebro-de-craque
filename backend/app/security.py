import threading
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

ALGORITHM = "HS256"
_hasher = PasswordHash.recommended()

# Cada hash Argon2 usa ~64 MiB. Limitar quantos rodam juntos evita que uma
# rajada de logins derrube o servidor por falta de memória.
_ARGON2_SLOTS = threading.BoundedSemaphore(4)
_DUMMY_HASH = _hasher.hash("senha-que-ninguem-usa")


def hash_password(password: str) -> str:
    with _ARGON2_SLOTS:
        return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    """Sem usuário (`hashed` None), verifica contra um hash falso.

    Assim o login demora o mesmo com ou sem conta, e o tempo de resposta não
    revela quais e-mails estão cadastrados.
    """
    with _ARGON2_SLOTS:
        ok = _hasher.verify(password, hashed or _DUMMY_HASH)
    return ok and hashed is not None


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def read_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
