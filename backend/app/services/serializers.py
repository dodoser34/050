"""Преобразование строк БД в ответы API."""
import json
import sqlite3

from ..config import IMG_URL


def img_url(path: str | None) -> str | None:
    """Демо-картинки лежат в assets/img (путь без «/»), загруженные — уже с полным путём /uploads/…"""
    if not path:
        return None
    return path if path.startswith(("/", "data:", "http")) else IMG_URL + path


def specialist_out(row: sqlite3.Row, bookmarked: set[int] = frozenset(), full: bool = False) -> dict:
    out = {
        "id": row["id"], "slug": row["slug"], "kind": row["kind"], "name": row["name"], "role": row["role"],
        "avatar": img_url(row["avatar"]), "cover": img_url(row["cover"]), "city": row["city"],
        "formats": json.loads(row["formats"]), "directions": json.loads(row["directions"]),
        "tags": json.loads(row["tags"]), "about": row["about"], "verified": bool(row["verified"]),
        "open": bool(row["open"]), "popularity": row["popularity"], "bookmarked": row["id"] in bookmarked,
        "status": row["status"],
    }
    if full:
        details = json.loads(row["details"])
        for item in details.get("portfolio", []):
            item["cover"] = img_url(item.get("cover"))
        for item in details.get("reviews", []):
            item["avatar"] = img_url(item.get("avatar"))
        out["details"] = details
    return out


def profile_flags(db: sqlite3.Connection) -> dict[str, dict]:
    """slug → {verified, kind, user_id}: значки рядом с именами участников и авторов."""
    return {r["slug"]: {"verified": bool(r["verified"]), "kind": r["kind"], "user_id": r["user_id"]}
            for r in db.execute("SELECT slug, verified, kind, user_id FROM specialists WHERE status = 'approved'")}


def project_out(row: sqlite3.Row, liked: set[int] = frozenset(), flags: dict | None = None) -> dict:
    team = json.loads(row["team"])
    flags = flags or {}
    for member in team:
        member["avatar"] = img_url(member.get("avatar"))
        f = flags.get(member.get("slug"), {})
        member["verified"] = f.get("verified", False)
        member["kind"] = f.get("kind", "person")
    owner = flags.get(row["owner_slug"] or "", {})
    return {
        "id": row["id"], "slug": row["slug"], "title": row["title"], "description": row["description"],
        "category": row["category"], "tags": json.loads(row["tags"]), "stage": row["stage"],
        "roles": json.loads(row["roles"]), "license": row["license"], "beta": bool(row["beta"]),
        "cover": img_url(row["cover"]), "owner_slug": row["owner_slug"], "owner_name": row["owner_name"],
        "owner_logo": img_url(row["owner_logo"]), "owner_verified": owner.get("verified", False),
        "owner_kind": owner.get("kind", "person"), "team": team, "team_count": len(team),
        "likes": row["likes"], "liked": row["id"] in liked, "status": row["status"], "closed": bool(row["closed"]),
    }


def matches(query: str, *fields: str | list[str]) -> bool:
    """Регистронезависимый поиск подстроки в строках и списках строк."""
    q = query.lower().strip()
    return not q or any(q in (f if isinstance(f, str) else " ".join(f)).lower() for f in fields)
