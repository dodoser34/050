"""Подключение к SQLite."""
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from ..config import DB_PATH


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """Соединение на одну операцию: commit при успехе, закрытие всегда."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
