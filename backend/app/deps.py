from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Player, User
from app.security import read_access_token

DbSession = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)


def current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    user_id = read_access_token(creds.credentials) if creds else None
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Sessão expirada. Entre de novo.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def owned_player(player_id: int, user: CurrentUser, db: DbSession) -> Player:
    player = db.get(Player, player_id)
    # 404 também quando o jogador é de outra conta, para não revelar que ele existe.
    if player is None or player.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jogador não encontrado.")
    return player


OwnedPlayer = Annotated[Player, Depends(owned_player)]
