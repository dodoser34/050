"""Каталог проектов, создание и редактирование, команда и её приватность, отклики и решения по ним, лайки."""
import json
import re

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..services import content, social
from ..services.serializers import matches, profile_flags, project_out, specialist_out
from ..services.text import unique_slug
from ..services.uploads import remove_upload, save_image
from ..web.dependencies import CurrentUser, OptionalUser, can_see


def clean_roles(roles: list[str]) -> list[str]:
    """Роли публикуются с заглавной буквы и без повторов: «дизайнер, Дизайнер» → «Дизайнер»."""
    out = []
    for r in roles:
        r = " ".join(r.split())[:40]
        if r:
            out.append(r[0].upper() + r[1:])
    return list(dict.fromkeys(out))


def clean_category(v: str) -> str:
    v = " ".join(v.split())
    if not 2 <= len(v) <= 40 or not re.search(r"[A-Za-zА-Яа-яЁё]", v):
        raise ValueError("Направление — от 2 до 40 символов")
    return v[0].upper() + v[1:]


class ProjectIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=10, max_length=400)
    category: str = Field(max_length=40)
    stage: str
    roles: list[str] = Field(default_factory=list, max_length=8)
    beta: bool = False
    cover_data: str = Field(default="", max_length=6_000_000)   # обложка: data URL из браузера

    @field_validator("roles")
    @classmethod
    def roles_clean(cls, v: list[str]) -> list[str]:
        return clean_roles(v)

    @field_validator("category")
    @classmethod
    def category_clean(cls, v: str) -> str:
        return clean_category(v)


class ProjectUpdateIn(ProjectIn):
    remove_cover: bool = False
    closed: bool = False
    about: str = Field(default="", max_length=3000)
    team_visibility: str = "all"
    show_team_count: bool = True
    blog_visibility: str = "all"

    @field_validator("team_visibility")
    @classmethod
    def visibility_known(cls, v: str) -> str:
        if v not in social.VISIBILITY:
            raise ValueError("Неизвестная настройка видимости")
        return v

    @field_validator("blog_visibility")
    @classmethod
    def blog_known(cls, v: str) -> str:
        if v not in ("all", "members"):
            raise ValueError("Неизвестная настройка")
        return v


class MemberIn(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=60)
    can_post: bool = False          # может публиковать в ленте проекта
    visible: bool = True            # показывать посетителям при видимости «выбранные»


class TeamIn(BaseModel):
    members: list[MemberIn] = Field(default_factory=list, max_length=60)


class ApplyIn(BaseModel):
    role: str = Field(default="", max_length=60)
    message: str = Field(min_length=5, max_length=1000)


class DecisionIn(BaseModel):
    status: str                     # accepted | declined
    message: str = Field(default="", max_length=1000)

    @field_validator("status")
    @classmethod
    def status_known(cls, v: str) -> str:
        if v not in ("accepted", "declined"):
            raise ValueError("Неизвестное решение")
        return v


router = APIRouter(prefix="/api/projects", tags=["projects"])
applications_router = APIRouter(prefix="/api/applications", tags=["projects"])


def _likes(db, user) -> set[int]:
    if not user:
        return set()
    return {r[0] for r in db.execute("SELECT project_id FROM likes WHERE user_id = ?", (user["id"],))}


def _categories(db) -> list[str]:
    base = content.taxonomy()["categories"]
    used = {r["category"] for r in db.execute("SELECT category FROM projects WHERE status = 'approved'")}
    return base + sorted(used - set(base))


def _owns(user, row, flags) -> bool:
    """Проект создан этим пользователем или принадлежит его анкете (в отличие от прав администратора)."""
    owner = flags.get(row["owner_slug"] or "", {})
    return bool(user and (row["author_id"] == user["id"] or (owner.get("user_id") and owner["user_id"] == user["id"])))


def _public(row, user, liked, flags) -> dict:
    """Проект для карточки с учётом приватности команды."""
    access = social.project_access(user, row, flags)
    return social.apply_team_privacy(project_out(row, liked, flags), social.project_details(row), access["is_member"])


@router.get("/meta")
def projects_meta():
    with get_db() as db:
        rows = db.execute("SELECT roles, license FROM projects WHERE status = 'approved'").fetchall()
        categories = _categories(db)
    return {
        "stages": content.taxonomy()["stages"],
        "categories": categories,
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
        flags = profile_flags(db)
    items = []
    for r in rows:
        if mine:  # «Мои проекты» — все свои, включая те, что на модерации
            if not _owns(user, r, flags):
                continue
        elif r["status"] != "approved":
            continue
        p = _public(r, user, liked, flags)
        if not matches(q, p["title"], p["description"], p["tags"], p["owner_name"]):
            continue
        if tag and tag not in p["tags"] and tag != p["category"]:
            continue
        if stage and p["stage"] != stage:
            continue
        if role and role not in p["roles"]:
            continue
        if license and p["license"] != license:
            continue
        if beta and not p["beta"]:
            continue
        if has_roles and (not p["roles"] or p["closed"]):
            continue
        if mine:
            p["moderation_note"] = r["moderation_note"]
        items.append(p)
    # завершённые проекты — после активных
    items.sort(key=(lambda p: (p["closed"], -p["id"])) if sort == "new" else (lambda p: (p["closed"], -p["likes"])))
    return {"total": len(items), "items": items[offset:offset + limit]}


def _owner_fields(db, user) -> tuple:
    profile = social.profile_of_user(db, user["id"])
    if profile and profile["status"] == "approved":
        return profile["slug"], profile["name"], profile["avatar"]
    return None, user["name"], ""


@router.post("", status_code=201)
def create_project(data: ProjectIn, user: CurrentUser):
    if data.stage not in content.taxonomy()["stages"]:
        raise HTTPException(status_code=422, detail="Неизвестная стадия")
    slug = unique_slug(data.title)
    cover = save_image(data.cover_data, "cover") if data.cover_data else ""
    with get_db() as db:
        owner_slug, owner_name, owner_logo = _owner_fields(db, user)
        cur = db.execute(
            """INSERT INTO projects (slug, title, description, category, tags, stage, roles, license, beta,
               cover, owner_slug, owner_name, owner_logo, team, details, likes, author_id, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (slug, data.title.strip(), data.description.strip(), data.category,
             json.dumps([data.category], ensure_ascii=False), data.stage, json.dumps(data.roles, ensure_ascii=False),
             "Закрытая", int(data.beta), cover, owner_slug, owner_name, owner_logo, "[]", "{}", 0, user["id"],
             "approved" if user["is_admin"] else "pending"),
        )
        row = db.execute("SELECT * FROM projects WHERE id = ?", (cur.lastrowid,)).fetchone()
        out = project_out(row, flags=profile_flags(db))
    return out


def _row_for_manager(db, slug: str, user: dict):
    row = db.execute("SELECT * FROM projects WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Проект не найден")
    if not social.can_manage_project(user, row, profile_flags(db)):
        raise HTTPException(status_code=403, detail="Управлять проектом может только его автор")
    return row


@router.get("/{slug}")
def get_project(slug: str, user: OptionalUser):
    """Страница проекта: сам проект, автор, этапы, права текущего пользователя и похожие проекты."""
    with get_db() as db:
        row = db.execute("SELECT * FROM projects WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not can_see(user, row["author_id"])):
            raise HTTPException(status_code=404, detail="Проект не найден")
        liked = _likes(db, user)
        flags = profile_flags(db)
        access = social.project_access(user, row, flags)
        details = social.project_details(row)
        project = social.apply_team_privacy(project_out(row, liked, flags), details, access["is_member"])
        owner = None
        if row["owner_slug"]:
            o = db.execute("SELECT * FROM specialists WHERE slug = ?", (row["owner_slug"],)).fetchone()
            owner = specialist_out(o) if o else None
            if owner:
                owner["presence"] = social.presence(db, o["user_id"], user, o["slug"])
        related = [_public(r, user, liked, flags) for r in db.execute(
            "SELECT * FROM projects WHERE category = ? AND slug != ? AND status = 'approved' AND closed = 0 ORDER BY likes DESC LIMIT 3",
            (row["category"], slug))]
        if len(related) < 3:
            seen = {slug, *(p["slug"] for p in related)}
            extra = db.execute("SELECT * FROM projects WHERE status = 'approved' AND closed = 0 ORDER BY likes DESC").fetchall()
            related += [_public(r, user, liked, flags) for r in extra if r["slug"] not in seen][: 3 - len(related)]
        application = None
        if user:
            a = db.execute("SELECT id, status, conversation_id FROM applications WHERE user_id = ? AND project_id = ?",
                           (user["id"], row["id"])).fetchone()
            application = dict(a) if a else None
        pending = 0
        if access["can_manage"]:
            pending = db.execute("SELECT COUNT(*) FROM applications WHERE project_id = ? AND status = 'pending'", (row["id"],)).fetchone()[0]
    project.update(owner=owner, related=related, stages=content.taxonomy()["stages"], applied=bool(application),
                   application=application, is_author=_owns(user, row, flags),
                   can_manage=access["can_manage"], can_post=access["can_post"], is_member=access["is_member"],
                   pending_applications=pending, details=details, created_at=row["created_at"],
                   status=row["status"], moderation_note=row["moderation_note"],
                   blog_visibility=details.get("blog_visibility", "all"))
    return project


@router.put("/{slug}")
def update_project(slug: str, data: ProjectUpdateIn, user: CurrentUser):
    """Редактирование автором: поля, обложка, статус «завершён», видимость команды и ленты."""
    if data.stage not in content.taxonomy()["stages"]:
        raise HTTPException(status_code=422, detail="Неизвестная стадия")
    with get_db() as db:
        row = _row_for_manager(db, slug, user)
        details = social.project_details(row)
        cover = row["cover"]
        if data.cover_data:
            remove_upload(cover)
            cover = save_image(data.cover_data, "cover")
        elif data.remove_cover:
            remove_upload(cover)
            cover = ""
        if data.about.strip():
            details["about"] = [p.strip() for p in data.about.split("\n\n") if p.strip()]
        else:
            details.pop("about", None)
        details.update(team_visibility=data.team_visibility, show_team_count=data.show_team_count,
                       blog_visibility=data.blog_visibility)
        # отклонённый проект после правки снова уходит на проверку
        status = "pending" if row["status"] == "rejected" and not user["is_admin"] else row["status"]
        tags = json.loads(row["tags"])
        if data.category not in tags:
            tags = [data.category] + [t for t in tags if t != row["category"]]
        db.execute(
            """UPDATE projects SET title=?, description=?, category=?, tags=?, stage=?, roles=?, beta=?, cover=?, closed=?,
               details=?, status=?, moderation_note=CASE WHEN ? = 'pending' THEN '' ELSE moderation_note END WHERE id = ?""",
            (data.title.strip(), data.description.strip(), data.category, json.dumps(tags, ensure_ascii=False), data.stage,
             json.dumps(data.roles, ensure_ascii=False), int(data.beta), cover, int(data.closed),
             json.dumps(details, ensure_ascii=False), status, status, row["id"]))
    return get_project(slug, user)


@router.delete("/{slug}")
def delete_project(slug: str, user: CurrentUser):
    with get_db() as db:
        row = _row_for_manager(db, slug, user)
        db.execute("DELETE FROM posts WHERE owner_type = 'project' AND owner_slug = ?", (slug,))
        db.execute("DELETE FROM projects WHERE id = ?", (row["id"],))
    remove_upload(row["cover"])
    return {"ok": True}


@router.put("/{slug}/team")
def update_team(slug: str, data: TeamIn, user: CurrentUser):
    """Состав команды и права участников: роль, публикация в ленте проекта, видимость для посетителей."""
    with get_db() as db:
        row = _row_for_manager(db, slug, user)
        before = {m["slug"] for m in json.loads(row["team"])}
        team = []
        for m in data.members:
            s = db.execute("SELECT slug, name, role, avatar, kind, user_id FROM specialists WHERE slug = ? AND status = 'approved'",
                           (m.slug,)).fetchone()
            if not s or s["kind"] != "person":
                raise HTTPException(status_code=422, detail="В команду можно добавить только опубликованную анкету специалиста")
            team.append({"slug": s["slug"], "name": s["name"], "role": " ".join(m.role.split()) or s["role"],
                         "avatar": s["avatar"], "can_post": m.can_post, "visible": m.visible})
            if s["slug"] not in before:
                social.notify(db, s["user_id"], "member", f"Вас добавили в команду проекта «{row['title']}»", f"/projects/{slug}")
        team = list({m["slug"]: m for m in team}.values())
        db.execute("UPDATE projects SET team = ? WHERE id = ?", (json.dumps(team, ensure_ascii=False), row["id"]))
    return get_project(slug, user)


@router.get("/{slug}/applications")
def project_applications(slug: str, user: CurrentUser):
    """Отклики на проект — для автора."""
    with get_db() as db:
        row = _row_for_manager(db, slug, user)
        rows = db.execute(
            """SELECT a.*, u.name AS user_name FROM applications a JOIN users u ON u.id = a.user_id
               WHERE a.project_id = ? ORDER BY a.status = 'pending' DESC, a.id DESC""", (row["id"],)).fetchall()
        items = []
        for a in rows:
            profile = social.profile_of_user(db, a["user_id"])
            items.append({"id": a["id"], "role": a["role"], "message": a["message"], "status": a["status"],
                          "created_at": a["created_at"], "conversation_id": a["conversation_id"],
                          "user": {"name": profile["name"] if profile else a["user_name"],
                                   "slug": profile["slug"] if profile and profile["status"] == "approved" else None,
                                   "avatar": specialist_out(profile)["avatar"] if profile else None,
                                   "role": profile["role"] if profile else ""}})
    return {"items": items}


@router.post("/{slug}/apply", status_code=201)
def apply(slug: str, data: ApplyIn, user: CurrentUser):
    with get_db() as db:
        row = db.execute("SELECT * FROM projects WHERE slug = ?", (slug,)).fetchone()
        flags = profile_flags(db)
        if row and _owns(user, row, flags):
            raise HTTPException(status_code=400, detail="Это ваш проект — откликаться на него не нужно")
        if not row or row["status"] != "approved":
            raise HTTPException(status_code=404, detail="Проект не найден")
        if row["closed"]:
            raise HTTPException(status_code=400, detail="Проект завершён и не принимает отклики")
        if db.execute("SELECT 1 FROM applications WHERE user_id = ? AND project_id = ?", (user["id"], row["id"])).fetchone():
            raise HTTPException(status_code=409, detail="Вы уже откликнулись на этот проект")
        # переписка с автором: если у проекта нет автора-пользователя, отвечает демо-анкета основателя
        author_id = row["author_id"] or flags.get(row["owner_slug"] or "", {}).get("user_id")
        conv = social.open_conversation(db, user["id"], author_id, row["owner_slug"], row["id"])
        role = " ".join(data.role.split())
        social.add_message(db, conv, user["id"], (f"Отклик на роль «{role}»\n\n" if role else "Отклик на проект\n\n") + data.message.strip())
        if not author_id:
            social.add_message(db, conv, None, social.demo_reply(row["owner_slug"] or slug, 1))
        db.execute("INSERT INTO applications (user_id, project_id, role, message, conversation_id) VALUES (?,?,?,?,?)",
                   (user["id"], row["id"], role, data.message.strip(), conv))
        social.notify(db, author_id, "application", f"{user['name']} откликается на проект «{row['title']}»" + (f" — {role}" if role else ""),
                      f"/projects/{slug}#applications")
    return {"ok": True, "project": row["title"], "conversation_id": conv}


@applications_router.post("/{application_id}/decision")
def decide(application_id: int, data: DecisionIn, user: CurrentUser):
    """Автор принимает или отклоняет отклик. Принятый участник с анкетой попадает в команду."""
    with get_db() as db:
        a = db.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
        if not a:
            raise HTTPException(status_code=404, detail="Отклик не найден")
        row = db.execute("SELECT * FROM projects WHERE id = ?", (a["project_id"],)).fetchone()
        if not social.can_manage_project(user, row, profile_flags(db)):
            raise HTTPException(status_code=403, detail="Решение по отклику принимает автор проекта")
        db.execute("UPDATE applications SET status = ? WHERE id = ?", (data.status, application_id))
        accepted = data.status == "accepted"
        if accepted:
            profile = social.profile_of_user(db, a["user_id"])
            team = json.loads(row["team"])
            roles = json.loads(row["roles"])
            if profile and profile["status"] == "approved" and all(m["slug"] != profile["slug"] for m in team):
                team.append({"slug": profile["slug"], "name": profile["name"], "role": a["role"] or profile["role"],
                             "avatar": profile["avatar"], "can_post": False, "visible": True})
            if a["role"] in roles:
                roles.remove(a["role"])
            db.execute("UPDATE projects SET team = ?, roles = ? WHERE id = ?",
                       (json.dumps(team, ensure_ascii=False), json.dumps(roles, ensure_ascii=False), row["id"]))
        text = (f"Отклик на проект «{row['title']}» принят — добро пожаловать в команду!" if accepted
                else f"Автор проекта «{row['title']}» ответил на ваш отклик: сейчас не получится")
        if a["conversation_id"]:
            social.add_message(db, a["conversation_id"], user["id"],
                               data.message.strip() or ("Принимаю ваш отклик — рады видеть вас в команде!" if accepted
                                                        else "Спасибо за отклик! Сейчас, к сожалению, не получится."))
        social.notify(db, a["user_id"], "application_status", text,
                      f"/messages?c={a['conversation_id']}" if a["conversation_id"] else f"/projects/{row['slug']}")
    return {"ok": True, "status": data.status}


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
