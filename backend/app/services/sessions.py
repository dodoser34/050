"""Сессии пользователей: токен в HttpOnly-cookie, в базе — только его SHA-256."""
import time

from ..config import SESSION_TTL_LONG, SESSION_TTL_SHORT
from ..core.security import new_session_token, token_digest
from ..db import get_db


def create_session(user_id: int, remember: bool) -> tuple[str, int]:
    """Создаёт сессию и возвращает (токен, срок жизни в секундах)."""
    token = new_session_token()
    ttl = SESSION_TTL_LONG if remember else SESSION_TTL_SHORT
    now = int(time.time())
    with get_db() as db:
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
        db.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
                   (token_digest(token), user_id, now + ttl))
    return token, ttl


def user_by_token(token: str) -> dict | None:
    with get_db() as db:
        row = db.execute(
            """SELECT u.id, u.name, u.email, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
            (token_digest(token), int(time.time())),
        ).fetchone()
    if not row:
        return None
    user = dict(row)
    user["is_admin"] = bool(user["is_admin"])
    return user


def delete_session(token: str) -> None:
    with get_db() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest(token),))
