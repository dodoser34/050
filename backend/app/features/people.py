"""Каталог специалистов и организаций, профиль, избранное, приглашения (приходят в сообщения)."""
import json
import time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..config import ONLINE_WINDOW
from ..db import get_db
from ..services import content, social
from ..services.serializers import img_url, matches, profile_flags, specialist_out
from ..web.dependencies import CurrentUser, OptionalUser, can_see


class InviteIn(BaseModel):
    message: str = Field(min_length=5, max_length=1000)
    project_slug: str = Field(default="", max_length=120)   # пригласить в конкретный свой проект


router = APIRouter(prefix="/api/specialists", tags=["specialists"])


def _bookmarks(db, user) -> set[int]:
    if not user:
        return set()
    return {r[0] for r in db.execute("SELECT specialist_id FROM bookmarks WHERE user_id = ?", (user["id"],))}


def _participation(db, row, viewer_is_owner: bool) -> list[dict]:
    """Проекты анкеты: основатель или участник. Скрытые владельцем проекты видит только он сам."""
    slug = row["slug"]
    hidden = set(json.loads(row["details"]).get("hidden_projects", []))
    out = []
    for r in db.execute("SELECT * FROM projects WHERE status = 'approved' ORDER BY closed, likes DESC"):
        member = next((m for m in json.loads(r["team"]) if m["slug"] == slug), None)
        founder = r["owner_slug"] == slug or bool(row["user_id"] and r["author_id"] == row["user_id"])
        if not (member or founder) or (r["slug"] in hidden and not viewer_is_owner):
            continue
        details = json.loads(r["details"] or "{}")
        if member and not founder and not viewer_is_owner:
            # участник, которого команда скрыла от посетителей, не «светит» проект в своём профиле
            vis = details.get("team_visibility", "all")
            if vis == "hidden" or (vis == "selected" and not member.get("visible", True)):
                continue
        out.append({"slug": r["slug"], "title": r["title"], "cover": img_url(r["cover"]), "stage": r["stage"],
                    "category": r["category"], "owner": founder, "founder": founder, "closed": bool(r["closed"]),
                    "member_role": member["role"] if member else "", "hidden": r["slug"] in hidden})
    return out


def _organizations(db, slug: str) -> list[dict]:
    """Организации, где специалист значится сотрудником (с учётом их приватности)."""
    out = []
    for r in db.execute("SELECT slug, name, avatar, verified, details FROM specialists WHERE kind = 'studio' AND status = 'approved'"):
        d = json.loads(r["details"])
        m = next((m for m in d.get("staff", []) if m["slug"] == slug), None)
        vis = d.get("staff_visibility", "all")
        if m and (vis == "all" or (vis == "selected" and m.get("visible", True))):
            out.append({"slug": r["slug"], "name": r["name"], "avatar": img_url(r["avatar"]), "verified": bool(r["verified"]),
                        "role": m.get("role", "")})
    return out


def _specialist_id(db, slug: str) -> int:
    row = db.execute("SELECT id FROM specialists WHERE slug = ? AND status = 'approved'", (slug,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return row["id"]


def _online_map(db) -> dict[int, bool]:
    """Кто сейчас в сети среди тех, кто разрешил показывать статус всем (для карточек каталога)."""
    now = time.time()
    return {r["id"]: now - (r["last_seen"] or 0) < ONLINE_WINDOW for r in db.execute("SELECT id, last_seen, settings FROM users")
            if social.user_settings(r).get("show_online", "all") == "all"}


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
        online = _online_map(db)
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
        s["online"] = online.get(r["user_id"], False) if r["user_id"] else social.demo_presence(r["slug"])["online"]
        items.append(s)
    sort_key = {"name": lambda s: s["name"], "new": lambda s: -s["id"]}.get(sort, lambda s: -s["popularity"])
    items.sort(key=sort_key)
    return {"total": len(items), "items": items}


@router.get("/meta")
def specialists_meta():
    with get_db() as db:
        rows = db.execute("SELECT city, directions, formats FROM specialists WHERE status = 'approved'").fetchall()
    used = {d for r in rows for d in json.loads(r["directions"])}
    base = content.taxonomy()["directions"]
    return {
        "directions": [d for d in base if d in used] + sorted(used - set(base)),
        "all_directions": base + sorted(used - set(base)),
        "cities": sorted({r["city"] for r in rows}),
        "formats": sorted({f for r in rows for f in json.loads(r["formats"])}),
    }


@router.get("/{slug}")
def get_specialist(slug: str, user: OptionalUser):
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not can_see(user, row["user_id"])):
            raise HTTPException(status_code=404, detail="Профиль не найден")
        is_owner = bool(user and row["user_id"] == user["id"])
        out = specialist_out(row, _bookmarks(db, user), full=True)
        flags = profile_flags(db)
        access = social.profile_access(user, row, flags)
        details = out["details"]
        details["participation"] = _participation(db, row, is_owner)
        details["organizations"] = _organizations(db, slug) if row["kind"] == "person" else []
        if row["kind"] == "studio":
            people = {r["slug"]: r for r in db.execute("SELECT slug, name, role, avatar, verified FROM specialists WHERE status = 'approved'")}
            details["staff"] = [{**m, "name": people[m["slug"]]["name"], "avatar": img_url(people[m["slug"]]["avatar"]),
                                 "profile_role": people[m["slug"]]["role"], "verified": bool(people[m["slug"]]["verified"])}
                                for m in details.get("staff", []) if m["slug"] in people]
            social.apply_staff_privacy(details, access["is_member"])
        if not is_owner:
            details.pop("hidden_projects", None)
        out["presence"] = social.presence(db, row["user_id"], user, None if row["user_id"] else slug)
    out.update(status=row["status"], moderation_note=row["moderation_note"], is_owner=is_owner,
               can_post=access["can_post"], is_member=access["is_member"],
               blog_visibility=details.get("blog_visibility", "all"))
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
    """Приглашение или сообщение специалисту: попадает в его сообщения (демо-анкета отвечает автоматически)."""
    with get_db() as db:
        specialist_id = _specialist_id(db, slug)
        s = db.execute("SELECT name, user_id FROM specialists WHERE id = ?", (specialist_id,)).fetchone()
        if s["user_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="Это ваша анкета")
        project = None
        if data.project_slug:
            project = db.execute("SELECT slug, title, author_id FROM projects WHERE slug = ?", (data.project_slug,)).fetchone()
            if not project or project["author_id"] != user["id"]:
                raise HTTPException(status_code=422, detail="Пригласить можно только в свой проект")
        db.execute("INSERT INTO invitations (user_id, specialist_id, message) VALUES (?,?,?)",
                   (user["id"], specialist_id, data.message.strip()))
        conv = social.open_conversation(db, user["id"], s["user_id"], slug)
        body = (f"Приглашение в проект «{project['title']}»: /projects/{project['slug']}\n\n" if project else "") + data.message.strip()
        social.add_message(db, conv, user["id"], body)
        if not s["user_id"]:
            n = db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = ?", (conv,)).fetchone()[0]
            social.add_message(db, conv, None, social.demo_reply(slug, n))
        elif project:
            social.notify(db, s["user_id"], "invite", f"{user['name']} приглашает вас в проект «{project['title']}»", f"/messages?c={conv}")
    return {"ok": True, "to": s["name"], "conversation_id": conv}
