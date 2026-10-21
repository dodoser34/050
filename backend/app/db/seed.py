"""Создание схемы и заполнение базы демо-контентом из content/*.json.

Демо-контент пересоздаётся, когда меняется "version" в content/taxonomy.json.
Пользователи, их сессии и созданные ими проекты при этом сохраняются.
"""
import json
import sqlite3
from pathlib import Path

from ..services import content
from .accounts import ensure_admin
from .connection import get_db
from .demo import ensure_demo

SCHEMA_SQL = Path(__file__).with_name("schema.sql")


def _dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False)


def _studio_staff(projects: list[dict], people: dict[str, dict]) -> dict[str, list[dict]]:
    """Сотрудники демо-организаций — участники их проектов. Публиковать в блоге может первый из них."""
    out: dict[str, list[dict]] = {}
    for p in projects:
        if people[p["owner"]]["kind"] != "studio":
            continue
        staff = out.setdefault(p["owner"], [])
        for slug in p["team"]:
            if people[slug]["kind"] == "person" and all(m["slug"] != slug for m in staff):
                staff.append({"slug": slug, "role": people[slug]["role"], "can_post": not staff, "visible": True})
    return out


def _specialist_row(s: dict, by_name: dict[str, dict], staff: list[dict] = ()) -> tuple:
    slug = s["slug"]
    portfolio = [{"title": w["title"], "meta": w["meta"], "cover": content.portfolio_path(slug, i + 1)}
                 for i, w in enumerate(s["portfolio"])]
    reviews = []
    for r in s["reviews"]:
        author = by_name.get(r["author"])
        reviews.append({"author": r["author"], "text": r["text"],
                        "slug": author["slug"] if author else None,
                        "avatar": content.avatar_path(author["slug"]) if author else None})
    details = {
        "bio": s["bio"],
        "skills": s["skills"],
        "work_format": "Проектная работа · " + " / ".join(s["formats"]),
        "contacts": [{"label": "Telegram", "icon": "send", "url": "https://t.me/"},
                     {"label": "Сайт", "icon": "link", "url": f"https://example.com/{slug}"}],
        "portfolio": portfolio,
        "experience": s["experience"],
        "reviews": reviews,
    }
    if s["kind"] == "studio":
        details.update(staff=list(staff), staff_visibility="all", show_staff_count=True)
    about = s["bio"].split(". ")[0].rstrip(".") + "."
    return (slug, s["kind"], s["name"], s["role"], content.avatar_path(slug), content.portfolio_path(slug, 1),
            s["city"], _dumps(s["formats"]), _dumps(s["directions"]), _dumps(s["tags"]), about,
            s["verified"], s["open"], s["popularity"], _dumps(details))


def _project_row(p: dict, people: dict[str, dict]) -> tuple:
    owner = people[p["owner"]]
    team = [{"slug": t, "name": people[t]["name"], "role": people[t]["role"], "avatar": content.avatar_path(t)}
            for t in p["team"]]
    return (p["slug"], p["title"], p["description"], p["category"], _dumps(p["tags"]), p["stage"],
            _dumps(p["roles"]), p["license"], p["beta"], content.project_cover_path(p["slug"]),
            owner["slug"], owner["name"], content.avatar_path(owner["slug"]), _dumps(team),
            _dumps(p.get("details", {})), p["likes"])


def seed_content(db: sqlite3.Connection) -> None:
    specialists = content.specialists()
    people = {s["slug"]: s for s in specialists}
    by_name = {s["name"]: s for s in specialists}

    # пересоздаём только демо-контент: анкеты и проекты пользователей не трогаем
    db.execute("DELETE FROM projects WHERE author_id IS NULL")
    db.execute("DELETE FROM specialists WHERE user_id IS NULL")
    staff = _studio_staff(content.projects(), people)
    db.executemany(
        """INSERT INTO specialists (slug, kind, name, role, avatar, cover, city, formats, directions,
           tags, about, verified, open, popularity, details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [_specialist_row(s, by_name, staff.get(s["slug"], [])) for s in specialists],
    )
    db.executemany(
        """INSERT INTO projects (slug, title, description, category, tags, stage, roles, license, beta, cover,
           owner_slug, owner_name, owner_logo, team, details, likes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [_project_row(p, people) for p in content.projects()],
    )
    db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('content_version', ?)",
               (str(content.taxonomy()["version"]),))


# Колонки, добавленные после первых версий схемы: при старте дописываются в существующую базу
MIGRATIONS = {
    "users": {"is_admin": "INTEGER NOT NULL DEFAULT 0", "account_type": "TEXT NOT NULL DEFAULT 'person'",
              "last_seen": "INTEGER NOT NULL DEFAULT 0", "settings": "TEXT NOT NULL DEFAULT '{}'"},
    "applications": {"status": "TEXT NOT NULL DEFAULT 'pending'", "conversation_id": "INTEGER"},
    "specialists": {"user_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
                    "status": "TEXT NOT NULL DEFAULT 'approved'", "moderation_note": "TEXT NOT NULL DEFAULT ''"},
    "projects": {"details": "TEXT NOT NULL DEFAULT '{}'", "status": "TEXT NOT NULL DEFAULT 'approved'",
                 "moderation_note": "TEXT NOT NULL DEFAULT ''", "closed": "INTEGER NOT NULL DEFAULT 0"},
}


def _migrate(db: sqlite3.Connection) -> None:
    for table, columns in MIGRATIONS.items():
        existing = {r[1] for r in db.execute(f"PRAGMA table_info({table})")}
        if not existing:
            continue  # таблицы ещё нет — её создаст schema.sql целиком
        for name, ddl in columns.items():
            if name not in existing:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def init_db() -> None:
    with get_db() as db:
        # таблица projects из самых ранних версий (без owner_slug) пересоздаётся
        cols = [r[1] for r in db.execute("PRAGMA table_info(projects)")]
        if cols and "owner_slug" not in cols:
            db.executescript("DROP TABLE IF EXISTS likes; DROP TABLE IF EXISTS projects;")
        _migrate(db)
        db.executescript(SCHEMA_SQL.read_text(encoding="utf-8"))
        row = db.execute("SELECT value FROM meta WHERE key = 'content_version'").fetchone()
        if not row or row[0] != str(content.taxonomy()["version"]):
            seed_content(db)
        ensure_admin(db)
        ensure_demo(db)
