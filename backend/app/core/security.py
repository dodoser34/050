"""Хеширование паролей (bcrypt) и токены сессий."""
import hashlib
import secrets

import bcrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# Хеш-заглушка: при несуществующем email проверяем пароль против него,
# чтобы время ответа не выдавало, зарегистрирован ли адрес.
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    """В базе храним только SHA-256 от токена, сам токен живёт в cookie."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
