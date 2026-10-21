"""Блоги и ленты: посты в профилях пользователей и организаций, лента проекта с результатами работы и опросами.
Кто может публиковать, решает владелец: в организации — сотрудники с правом публикации, в проекте — участники с этим правом."""
import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..services import social
from ..services.serializers import img_url, profile_flags
from ..services.uploads import remove_upload, save_image
from ..web.dependencies import CurrentUser, OptionalUser


class PostIn(BaseModel):
    owner_type: str                           # profile | project
    owner_slug: str = Field(min_length=1, max_length=120)
    kind: str = "post"                        # post — запись, result — результат работы, poll — опрос
    title: str = Field(default="", max_length=120)
    body: str = Field(default="", max_length=4000)
    image_data: str = Field(default="", max_length=6_000_000)
    options: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("owner_type")
    @classmethod
    def owner_known(cls, v: str) -> str:
        if v not in ("profile", "project"):
            raise ValueError("Неизвестный раздел")
        return v

    @field_validator("kind")
    @classmethod
    def kind_known(cls, v: str) -> str:
        if v not in ("post", "result", "poll"):
            raise ValueError("Неизвестный тип записи")
        return v


class VoteIn(BaseModel):
    option: int = Field(ge=0, le=7)


router = APIRouter(prefix="/api/posts", tags=["posts"])


def _owner(db, owner_type: str, slug: str, user: dict | None):
    """Строка владельца ленты и права текущего пользователя."""
    flags = profile_flags(db)
    if owner_type == "project":
        row = db.execute("SELECT * FROM projects WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not social.can_manage_project(user, row, flags)):
            raise HTTPException(status_code=404, detail="Проект не найден")
        access = social.project_access(user, row, flags)
        access["can_moderate"] = access["can_manage"]
        title = row["title"]
    else:
        row = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
        if not row or (row["status"] != "approved" and not (user and (user["is_admin"] or row["user_id"] == user["id"]))):
            raise HTTPException(status_code=404, detail="Профиль не найден")
        access = social.profile_access(user, row, flags)
        access["can_moderate"] = access["is_owner"] or bool(user and user["is_admin"])
        title = row["name"]
    details = json.loads(row["details"] or "{}")
    access["blog_visibility"] = details.get("blog_visibility", "all")
    return row, access, title


def _post_out(db, r, user, access) -> dict:
    options = json.loads(r["poll"] or "[]")
    poll = None
    if r["kind"] == "poll":
        counts = {v["option"]: v["n"] for v in db.execute(
            "SELECT option, COUNT(*) AS n FROM poll_votes WHERE post_id = ? GROUP BY option", (r["id"],))}
        mine = db.execute("SELECT option FROM poll_votes WHERE post_id = ? AND user_id = ?", (r["id"], user["id"])).fetchone() if user else None
        poll = {"options": [{"text": o, "votes": counts.get(i, 0)} for i, o in enumerate(options)],
                "total": sum(counts.values()), "my_vote": mine["option"] if mine else None}
    author_avatar = None
    if r["author_slug"]:
        a = db.execute("SELECT avatar FROM specialists WHERE slug = ?", (r["author_slug"],)).fetchone()
        author_avatar = img_url(a["avatar"]) if a else None
    return {"id": r["id"], "kind": r["kind"], "title": r["title"], "body": r["body"], "image": img_url(r["image"]),
            "poll": poll, "created_at": r["created_at"],
            "author": {"name": r["author_name"], "slug": r["author_slug"], "avatar": author_avatar},
            "can_delete": bool(user and (r["author_id"] == user["id"] or access["can_moderate"]))}


@router.get("")
def list_posts(user: OptionalUser, owner_type: str = Query(...), owner_slug: str = Query(...), limit: int = Query(30, ge=1, le=100)):
    with get_db() as db:
        _, access, _ = _owner(db, owner_type, owner_slug, user)
        hidden = access["blog_visibility"] == "members" and not access["is_member"]
        rows = [] if hidden else db.execute(
            "SELECT * FROM posts WHERE owner_type = ? AND owner_slug = ? ORDER BY id DESC LIMIT ?",
            (owner_type, owner_slug, limit)).fetchall()
        items = [_post_out(db, r, user, access) for r in rows]
    return {"items": items, "can_post": access["can_post"], "hidden": hidden, "visibility": access["blog_visibility"]}


@router.post("", status_code=201)
def create_post(data: PostIn, user: CurrentUser):
    title, body = data.title.strip(), data.body.strip()
    options = [" ".join(o.split())[:80] for o in data.options if o.strip()]
    if data.kind == "poll":
        if len(title) < 3:
            raise HTTPException(status_code=422, detail="Сформулируйте вопрос опроса")
        if len(options) < 2:
            raise HTTPException(status_code=422, detail="В опросе нужно хотя бы два варианта ответа")
    elif len(body) < 3 and not data.image_data:
        raise HTTPException(status_code=422, detail="Напишите текст записи или добавьте картинку")
    with get_db() as db:
        row, access, owner_title = _owner(db, data.owner_type, data.owner_slug, user)
        if not access["can_post"]:
            raise HTTPException(status_code=403, detail="Публиковать здесь может владелец и те, кому он дал право публикации")
        image = save_image(data.image_data, "post") if data.image_data else ""
        profile = social.profile_of_user(db, user["id"])
        author_slug = profile["slug"] if profile and profile["status"] == "approved" else None
        pid = db.execute(
            """INSERT INTO posts (owner_type, owner_slug, author_id, author_name, author_slug, kind, title, body, image, poll)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (data.owner_type, data.owner_slug, user["id"], profile["name"] if profile else user["name"], author_slug,
             data.kind, title, body, image, json.dumps(options if data.kind == "poll" else [], ensure_ascii=False))).lastrowid
        if data.owner_type == "project":
            # участникам проекта — уведомление о новой записи в ленте
            flags = profile_flags(db)
            for uid in (social.member_user_ids(json.loads(row["team"]), flags) | {row["author_id"]}) - {user["id"], None}:
                social.notify(db, uid, "post", f"Новая запись в ленте проекта «{owner_title}»", f"/projects/{data.owner_slug}#feed")
        r = db.execute("SELECT * FROM posts WHERE id = ?", (pid,)).fetchone()
        return _post_out(db, r, user, access)


@router.delete("/{post_id}")
def delete_post(post_id: int, user: CurrentUser):
    with get_db() as db:
        r = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Запись не найдена")
        _, access, _ = _owner(db, r["owner_type"], r["owner_slug"], user)
        if r["author_id"] != user["id"] and not access["can_moderate"]:
            raise HTTPException(status_code=403, detail="Удалить запись может автор или владелец раздела")
        db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    remove_upload(r["image"])
    return {"ok": True}


@router.post("/{post_id}/vote")
def vote(post_id: int, data: VoteIn, user: CurrentUser):
    with get_db() as db:
        r = db.execute("SELECT * FROM posts WHERE id = ? AND kind = 'poll'", (post_id,)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Опрос не найден")
        _, access, _ = _owner(db, r["owner_type"], r["owner_slug"], user)
        if access["blog_visibility"] == "members" and not access["is_member"]:
            raise HTTPException(status_code=403, detail="Голосовать могут только участники")
        if data.option >= len(json.loads(r["poll"])):
            raise HTTPException(status_code=422, detail="Нет такого варианта")
        db.execute("""INSERT INTO poll_votes (post_id, user_id, option) VALUES (?,?,?)
                      ON CONFLICT(post_id, user_id) DO UPDATE SET option = excluded.option""", (post_id, user["id"], data.option))
        return _post_out(db, r, user, access)
