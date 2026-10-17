"""Каталог проектов, создание проекта, лайки."""
import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_db
from ..services import content
from ..services.serializers import matches, project_out, specialist_out
from ..services.text import unique_slug
from ..web.dependencies import CurrentUser, OptionalUser, can_see


class ProjectIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=10, max_length=400)
    category: str
    stage: str
    roles: list[str] = Field(default_factory=list, max_length=5)
    beta: bool = False


class ApplyIn(BaseModel):
    role: str = Field(default="", max_length=60)
    message: str = Field(min_length=5, max_length=1000)


router = APIRouter(prefix="/api/projects", tags=["projects"])


def _likes(db, user) -> set[int]:
    if not user:
        return set()
    return {r[0] for r in db.execute("SELECT project_id FROM likes WHERE user_id = ?", (user["id"],))}


@router.get("/meta")
def projects_meta():
    with get_db() as db:
        rows = db.execute("SELECT roles, license FROM projects WHERE status = 'approved'").fetchall()
    tax = content.taxonomy()
    return {
        "stages": tax["stages"],
        "categories": tax["categories"],
        "roles": sorted({role for r in rows for role in json.loads(r["roles"])}),
        "licenses": sorted({r["license"] for r in rows}),
    }


@router.get("")
def list_projects(
    user: OptionalUser,
    q: str = "",
    tag: str | None = None,
    stage: str | None = None,
    role: str | None = None,
    license: str | None = None,
    beta: bool = False,
    has_roles: bool = False,
    mine: bool = False,
    sort: str = "popular",
    offset: int = Query(0, ge=0),
    limit: int = Query(3, ge=1, le=50),
):
    with get_db() as db:
        rows = db.execute("SELECT * FROM projects").fetchall()
        liked = _likes(db, user)
    items = []
    for r in rows:
        if mine:  # «Мои проекты» — все свои, включая те, что на модерации
            if not (user and r["author_id"] == user["id"]):
                continue
        elif r["status"] != "approved":
            continue
        p = project_out(r, liked)
        if not matches(q, p["title"], p["description"], p["tags"], p["owner_name"]):
            continue
        if tag and tag not in p["tags"]:
            continue
        if stage and p["stage"] != stage:
            continue
        if role and role not in p["roles"]:
            continue
        if license and p["license"] != license:
            continue
        if beta and not p["beta"]:
            continue
        if has_roles and not p["roles"]:
            continue
        items.append(p)
    items.sort(key=(lambda p: -p["id"]) if sort == "new" else (lambda p: -p["likes"]))
    return {"total": len(items), "items": items[offset:offset + limit]}


@router.post("", status_code=201)
def create_project(data: ProjectIn, user: CurrentUser):
    tax = content.taxonomy()
    if data.category not in tax["categories"]:
        raise HTTPException(status_code=422, detail="Неизвестная категория")
    if data.stage not in tax["stages"]:
        raise HTTPException(status_code=422, detail="Неизвестная стадия")
    roles = list(dict.fromkeys(r.strip()[:40] for r in data.roles if r.strip()))
    slug = unique_slug(data.title)
    with get_db() as db:
        cur = db.execute(
            """INSERT INTO projects (slug, title, description, category, tags, stage, roles, license, beta,
               cover, owner_name, owner_logo, team, details, likes, author_id, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (slug, data.title.strip(), data.description.strip(), data.category,
             json.dumps([data.category], ensure_ascii=False), data.stage, json.dumps(roles, ensure_ascii=False),
             "Закрытая", int(data.beta), "", user["name"], "", "[]", "{}", 0, user["id"],
             "approved" if user["is_admin"] else "pending"),
        )
        row = db.execute("SELECT * FROM projects WHERE id = ?", (cur.lastrowid,)).fetchone()
    out = project_out(row)
    out["status"] = row["status"]
    return out


@router.get("/{slug}")
def get_project(slug: str, user: OptionalUser):
    """Страница проекта: сам проект, автор, этапы и похожие проекты."""
    with get_db() as db:
        row = db.execute("SELECT * FROM projects WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not can_see(user, row["author_id"])):
            raise HTTPException(status_code=404, detail="Проект не найден")
        liked = _likes(db, user)
        project = project_out(row, liked)
        owner = None
        if row["owner_slug"]:
            o = db.execute("SELECT * FROM specialists WHERE slug = ?", (row["owner_slug"],)).fetchone()
            owner = specialist_out(o) if o else None
        related = [project_out(r, liked) for r in db.execute(
            "SELECT * FROM projects WHERE category = ? AND slug != ? AND status = 'approved' ORDER BY likes DESC LIMIT 3",
            (row["category"], slug))]
        if len(related) < 3:
            seen = {slug, *(p["slug"] for p in related)}
            extra = db.execute("SELECT * FROM projects WHERE status = 'approved' ORDER BY likes DESC").fetchall()
            related += [project_out(r, liked) for r in extra if r["slug"] not in seen][: 3 - len(related)]
        applied = bool(user and db.execute("SELECT 1 FROM applications WHERE user_id = ? AND project_id = ?",
                                           (user["id"], row["id"])).fetchone())
    project.update(owner=owner, related=related, stages=content.taxonomy()["stages"], applied=applied,
                   is_author=bool(user and row["author_id"] == user["id"]),
                   details=json.loads(row["details"] or "{}"), created_at=row["created_at"],
                   status=row["status"], moderation_note=row["moderation_note"])
    return project


@router.post("/{slug}/apply", status_code=201)
def apply(slug: str, data: ApplyIn, user: CurrentUser):
    with get_db() as db:
        row = db.execute("SELECT id, title, author_id, status FROM projects WHERE slug = ?", (slug,)).fetchone()
        if row and row["author_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="Это ваш проект — откликаться на него не нужно")
        if not row or row["status"] != "approved":
            raise HTTPException(status_code=404, detail="Проект не найден")
        if db.execute("SELECT 1 FROM applications WHERE user_id = ? AND project_id = ?", (user["id"], row["id"])).fetchone():
            raise HTTPException(status_code=409, detail="Вы уже откликнулись на этот проект")
        db.execute("INSERT INTO applications (user_id, project_id, role, message) VALUES (?,?,?,?)",
                   (user["id"], row["id"], data.role.strip(), data.message.strip()))
    return {"ok": True, "project": row["title"]}


@router.post("/{project_id:int}/like")
def toggle_like(project_id: int, user: CurrentUser):
    with get_db() as db:
        if not db.execute("SELECT 1 FROM projects WHERE id = ? AND status = 'approved'", (project_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Проект не найден")
        args = (user["id"], project_id)
        if db.execute("SELECT 1 FROM likes WHERE user_id = ? AND project_id = ?", args).fetchone():
            db.execute("DELETE FROM likes WHERE user_id = ? AND project_id = ?", args)
            db.execute("UPDATE projects SET likes = likes - 1 WHERE id = ?", (project_id,))
            liked = False
        else:
            db.execute("INSERT INTO likes (user_id, project_id) VALUES (?,?)", args)
            db.execute("UPDATE projects SET likes = likes + 1 WHERE id = ?", (project_id,))
            liked = True
        likes = db.execute("SELECT likes FROM projects WHERE id = ?", (project_id,)).fetchone()[0]
    return {"liked": liked, "likes": likes}
