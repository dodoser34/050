"""Служебные аккаунты: администратор сайта."""
import sqlite3

from ..config import ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
from ..core.security import hash_password, verify_password


def ensure_admin(db: sqlite3.Connection) -> int:
    """Создаёт администратора из настроек (SREDA_ADMIN_EMAIL / SREDA_ADMIN_PASSWORD) или обновляет ему пароль и роль."""
    row = db.execute("SELECT id, password_hash FROM users WHERE email = ?", (ADMIN_EMAIL,)).fetchone()
    if row is None:
        return db.execute("INSERT INTO users (name, email, password_hash, is_admin) VALUES (?,?,?,1)",
                          (ADMIN_NAME, ADMIN_EMAIL, hash_password(ADMIN_PASSWORD))).lastrowid
    if not verify_password(ADMIN_PASSWORD, row["password_hash"]):
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(ADMIN_PASSWORD), row["id"]))
    db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
    return row["id"]
