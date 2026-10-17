"""Настройки сайта в таблице settings (значения — JSON)."""
import json
import sqlite3

FEATURED_KEY = "home_featured"   # {"freelancer": slug, "team": slug, "project": slug}


def get_setting(db: sqlite3.Connection, key: str, default=None):
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_setting(db: sqlite3.Connection, key: str, value) -> None:
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))
