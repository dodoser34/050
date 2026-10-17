"""Регистрация, вход, выход, текущий пользователь, демо-вход."""
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, EmailStr, field_validator

from ..config import ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_EMAIL, DEMO_ENABLED, DEMO_PASSWORD, SESSION_COOKIE
from ..core.security import DUMMY_HASH, hash_password, verify_password
from ..db import get_db
from ..db.accounts import ensure_admin
from ..db.demo import ensure_demo
from ..services import sessions
from ..web.dependencies import OptionalUser, clear_session_cookie, set_session_cookie


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str
    accept_terms: bool

    @field_validator("name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Укажите имя")
        return v

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль должен содержать не менее 8 символов")
        if len(v.encode("utf-8")) > 72:  # предел bcrypt
            raise ValueError("Пароль слишком длинный (максимум 72 байта)")
        return v

    @field_validator("accept_terms")
    @classmethod
    def terms_accepted(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Нужно принять условия использования")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _public(row) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"], "is_admin": bool(row["is_admin"])}


@router.post("/register", status_code=201)
def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    with get_db() as db:
        if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="Пользователь с такой почтой уже зарегистрирован")
        cur = db.execute("INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
                         (data.name, email, hash_password(data.password)))
        user_id = cur.lastrowid
    token, ttl = sessions.create_session(user_id, remember=True)
    set_session_cookie(response, token, ttl, persistent=True)
    return {"id": user_id, "name": data.name, "email": email, "is_admin": False}


@router.post("/login")
def login(data: LoginIn, response: Response):
    with get_db() as db:
        row = db.execute("SELECT id, name, email, is_admin, password_hash FROM users WHERE email = ?",
                         (data.email.lower(),)).fetchone()
    if not row:
        verify_password(data.password, DUMMY_HASH)
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")
    if not verify_password(data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")
    token, ttl = sessions.create_session(row["id"], data.remember)
    set_session_cookie(response, token, ttl, persistent=data.remember)
    return _public(row)


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sessions.delete_session(token)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: OptionalUser):
    return {"user": user}


@router.get("/demo")
def demo_info():
    """Есть ли демо-вход и с какими данными (их показываем на странице входа)."""
    if not DEMO_ENABLED:
        return {"enabled": False}
    return {"enabled": True, "email": DEMO_EMAIL, "password": DEMO_PASSWORD,
            "admin_email": ADMIN_EMAIL, "admin_password": ADMIN_PASSWORD}


class DemoIn(BaseModel):
    role: str = "user"  # user | admin


@router.post("/demo")
def demo_login(response: Response, data: DemoIn | None = None):
    """Вход одним кликом: в демо-аккаунт пользователя или администратора."""
    if not DEMO_ENABLED:
        raise HTTPException(status_code=404, detail="Демо-вход отключён")
    as_admin = bool(data and data.role == "admin")
    with get_db() as db:
        ensure_admin(db) if as_admin else ensure_demo(db)
        row = db.execute("SELECT id, name, email, is_admin FROM users WHERE email = ?",
                         (ADMIN_EMAIL if as_admin else DEMO_EMAIL,)).fetchone()
    token, ttl = sessions.create_session(row["id"], remember=False)
    set_session_cookie(response, token, ttl, persistent=False)
    return _public(row)
