"""Зависимости роутов: текущий пользователь и cookie сессии."""
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response

from ..config import COOKIE_SECURE, SESSION_COOKIE
from ..services import sessions


def current_user(request: Request) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    return sessions.user_by_token(token) if token else None


def require_user(user: Annotated[dict | None, Depends(current_user)]) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Войдите, чтобы продолжить")
    return user


def require_admin(user: Annotated[dict, Depends(require_user)]) -> dict:
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Раздел доступен только администраторам")
    return user


OptionalUser = Annotated[dict | None, Depends(current_user)]
CurrentUser = Annotated[dict, Depends(require_user)]
AdminUser = Annotated[dict, Depends(require_admin)]


def can_see(user: dict | None, owner_id: int | None) -> bool:
    """Неопубликованное (на модерации / отклонённое) видят только автор и администраторы."""
    return bool(user and (user["is_admin"] or user["id"] == owner_id))


def set_session_cookie(response: Response, token: str, ttl: int, persistent: bool) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=ttl if persistent else None,
                        httponly=True, samesite="lax", secure=COOKIE_SECURE, path="/")


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
