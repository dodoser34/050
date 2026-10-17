"""Каталог специалистов и студий, профиль, избранное, приглашения."""
import json
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_db
from ..services import content
from ..services.serializers import img_url, matches, specialist_out
from ..web.dependencies import CurrentUser, OptionalUser, can_see


class InviteIn(BaseModel):
    message: str = Field(min_length=5, max_length=1000)


router = APIRouter(prefix="/api/specialists", tags=["specialists"])


def _bookmarks(db, user) -> set[int]:
    if not user:
        return set()
    return {r[0] for r in db.execute("SELECT specialist_id FROM bookmarks WHERE user_id = ?", (user["id"],))}


def _participation(db, slug: str) -> list[dict]:
    """Проекты, где специалист в команде или владелец."""
    out = []
    for r in db.execute("SELECT * FROM projects WHERE status = 'approved' ORDER BY likes DESC"):
        in_team = any(m["slug"] == slug for m in json.loads(r["team"]))
        if in_team or r["owner_slug"] == slug:
            out.append({"slug": r["slug"], "title": r["title"], "cover": img_url(r["cover"]), "stage": r["stage"],
                        "category": r["category"], "owner": r["owner_slug"] == slug})
    return out


def _specialist_id(db, slug: str) -> int:
    row = db.execute("SELECT id FROM specialists WHERE slug = ? AND status = 'approved'", (slug,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return row["id"]


@router.get("")
def list_specialists(
    user: OptionalUser,
    q: str = "",
    kind: str | None = None,
    direction: Annotated[list[str], Query()] = [],
    format: Annotated[list[str], Query()] = [],
    city: str | None = None,
    available: bool = False,
    sort: str = "popular",
):
    with get_db() as db:
        rows = db.execute("SELECT * FROM specialists WHERE status = 'approved'").fetchall()
        bookmarked = _bookmarks(db, user)
    items = []
    for r in rows:
        s = specialist_out(r, bookmarked)
        if kind and s["kind"] != kind:
            continue
        if not matches(q, s["name"], s["role"], s["tags"], s["directions"]):
            continue
        if direction and not set(direction) & set(s["directions"]):
            continue
        if format and not set(format) & set(s["formats"]):
            continue
        if city and s["city"] != city:
            continue
        if available and not s["open"]:
            continue
        items.append(s)
    sort_key = {"name": lambda s: s["name"], "new": lambda s: -s["id"]}.get(sort, lambda s: -s["popularity"])
    items.sort(key=sort_key)
    return {"total": len(items), "items": items}


@router.get("/meta")
def specialists_meta():
    with get_db() as db:
        rows = db.execute("SELECT city, directions, formats FROM specialists WHERE status = 'approved'").fetchall()
    used = {d for r in rows for d in json.loads(r["directions"])}
    return {
        "directions": [d for d in content.taxonomy()["directions"] if d in used],
        "cities": sorted({r["city"] for r in rows}),
        "formats": sorted({f for r in rows for f in json.loads(r["formats"])}),
    }


@router.get("/{slug}")
def get_specialist(slug: str, user: OptionalUser):
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not can_see(user, row["user_id"])):
            raise HTTPException(status_code=404, detail="Профиль не найден")
        out = specialist_out(row, _bookmarks(db, user), full=True)
        out["details"]["participation"] = _participation(db, slug)
    out.update(status=row["status"], moderation_note=row["moderation_note"],
               is_owner=bool(user and row["user_id"] == user["id"]))
    return out


@router.post("/{slug}/bookmark")
def toggle_bookmark(slug: str, user: CurrentUser):
    with get_db() as db:
        args = (user["id"], _specialist_id(db, slug))
        if db.execute("SELECT 1 FROM bookmarks WHERE user_id = ? AND specialist_id = ?", args).fetchone():
            db.execute("DELETE FROM bookmarks WHERE user_id = ? AND specialist_id = ?", args)
            return {"bookmarked": False}
        db.execute("INSERT INTO bookmarks (user_id, specialist_id) VALUES (?,?)", args)
        return {"bookmarked": True}


@router.post("/{slug}/invite", status_code=201)
def invite(slug: str, data: InviteIn, user: CurrentUser):
    with get_db() as db:
        specialist_id = _specialist_id(db, slug)
        name = db.execute("SELECT name FROM specialists WHERE id = ?", (specialist_id,)).fetchone()["name"]
        db.execute("INSERT INTO invitations (user_id, specialist_id, message) VALUES (?,?,?)",
                   (user["id"], specialist_id, data.message.strip()))
    return {"ok": True, "to": name}
