"""Limite de tentativas de login e cadastro por IP, dentro da própria API.

O nginx do docker-compose já limita, mas na nuvem (Render) a API fica exposta
direto. É um limitador em memória: vale para um processo, que é o caso do
plano gratuito.
"""

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.config import get_settings

WINDOW_S = 60.0

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    # Atrás do proxy da nuvem, o uvicorn (--proxy-headers) já põe o IP real em client.host.
    return request.client.host if request.client else "desconhecido"


def limit_auth(request: Request) -> None:
    limit = get_settings().auth_rate_limit_per_minute
    now = time.monotonic()
    key = _client_ip(request)
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] > WINDOW_S:
            hits.popleft()
        if len(hits) >= limit:
            retry = int(WINDOW_S - (now - hits[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)
        # Não deixa o dicionário crescer sem fim com IPs que já sumiram.
        if len(_hits) > 10_000:
            for ip in [ip for ip, h in _hits.items() if not h or now - h[-1] > WINDOW_S]:
                del _hits[ip]


def reset() -> None:
    """Para os testes."""
    with _lock:
        _hits.clear()
