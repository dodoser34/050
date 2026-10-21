"""Личный кабинет: анкета специалиста/организации (уходит на модерацию), портфолио, сотрудники организации,
настройки приватности и отклики пользователя."""
import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..services import content, social
from ..services.serializers import img_url, profile_flags, specialist_out
from ..services.text import unique_slug
from ..services.uploads import remove_upload, save_image
from ..web.dependencies import CurrentUser

VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "rutube.ru", "vk.com", "vkvideo.ru")


class WorkIn(BaseModel):
    type: str = "image"                        # image — изображение, video — видео по ссылке, project — проект
    title: str = Field(min_length=2, max_length=80)
    meta: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=600)
    cover: str = Field(default="", max_length=300)          # уже загруженная картинка (оставить как есть)
    image_data: str = Field(default="", max_length=6_000_000)  # новая картинка (data URL)
    video_url: str = Field(default="", max_length=300)
    project_slug: str = Field(default="", max_length=120)
    url: str = Field(default="", max_length=300)

    @field_validator("type")
    @classmethod
    def type_known(cls, v: str) -> str:
        if v not in ("image", "video", "project"):
            raise ValueError("Неизвестный тип работы")
        return v

    @field_validator("video_url", "url")
    @classmethod
    def link(cls, v: str) -> str:
        v = v.strip()
        if v and not v.startswith(("https://", "http://")):
            raise ValueError("Ссылка должна начинаться с https://")
        return v


class ExperienceIn(BaseModel):
    place: str = Field(min_length=2, max_length=80)
    role: str = Field(default="", max_length=80)
    period: str = Field(default="", max_length=40)


class ProfileIn(BaseModel):
    kind: str = "person"                       # person | studio (организация)
    name: str = Field(min_length=2, max_length=80)
    role: str = Field(min_length=2, max_length=80)
    city: str = Field(min_length=2, max_length=60)
    formats: list[str] = Field(default_factory=list, max_length=3)
    directions: list[str] = Field(min_length=1, max_length=6)
    tags: list[str] = Field(default_factory=list, max_length=6)
    bio: str = Field(min_length=20, max_length=1200)
    skills: list[str] = Field(default_factory=list, max_length=12)
    telegram: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=200)
    open: bool = True
    avatar_data: str = Field(default="", max_length=6_000_000)
    portfolio: list[WorkIn] = Field(default_factory=list, max_length=12)
    experience: list[ExperienceIn] = Field(default_factory=list, max_length=8)

    @field_validator("kind")
    @classmethod
    def kind_known(cls, v: str) -> str:
        if v not in ("person", "studio"):
            raise ValueError("Выберите: специалист или организация")
        return v

    @field_validator("tags", "skills", "formats")
    @classmethod
    def clean_list(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(x.strip()[:40] for x in v if x.strip()))

    @field_validator("directions")
    @classmethod
    def clean_directions(cls, v: list[str]) -> list[str]:
        """Свои направления разрешены: 2–40 символов, первая буква заглавная."""
        out = []
        for x in v:
            x = " ".join(x.split())
            if not 2 <= len(x) <= 40 or not re.search(r"[A-Za-zА-Яа-яЁё]", x):
                raise ValueError("Название направления — от 2 до 40 символов")
            out.append(x[0].upper() + x[1:])
        return list(dict.fromkeys(out))

    @field_validator("website", "telegram")
    @classmethod
    def link(cls, v: str) -> str:
        v = v.strip()
        if v and not v.startswith(("https://", "http://", "@")):
            raise ValueError("Ссылка должна начинаться с https:// (для Telegram можно @имя)")
        return v


class StaffIn(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=60)
    can_post: bool = False                      # может публиковать в блоге организации
    visible: bool = True                        # показывать посетителям (при видимости «выбранные»)


class OrgIn(BaseModel):
    staff: list[StaffIn] = Field(default_factory=list, max_length=100)
    staff_visibility: str = "all"
    show_staff_count: bool = True

    @field_validator("staff_visibility")
    @classmethod
    def visibility_known(cls, v: str) -> str:
        if v not in social.VISIBILITY:
            raise ValueError("Неизвестная настройка видимости")
        return v


class SettingsIn(BaseModel):
    show_online: str = "all"                   # all | contacts | nobody
    hidden_projects: list[str] = Field(default_factory=list, max_length=200)
    blog_visibility: str = "all"               # all | members

    @field_validator("show_online")
    @classmethod
    def online_known(cls, v: str) -> str:
        if v not in social.SHOW_ONLINE:
            raise ValueError("Неизвестная настройка")
        return v

    @field_validator("blog_visibility")
    @classmethod
    def blog_known(cls, v: str) -> str:
        if v not in ("all", "members"):
            raise ValueError("Неизвестная настройка")
        return v


router = APIRouter(prefix="/api/me", tags=["me"])

# Ключи деталей анкеты, которые меняются не формой анкеты, а отдельными настройками — их сохраняем как есть
KEPT_DETAILS = ("reviews", "staff", "staff_visibility", "show_staff_count", "hidden_projects", "blog_visibility")


def _profile_out(row) -> dict:
    out = specialist_out(row, full=True)
    out.update(status=row["status"], moderation_note=row["moderation_note"])
    return out


def _directions(db) -> list[str]:
    """Направления из справочника и свои, которые уже добавили другие участники."""
    base = content.taxonomy()["directions"]
    used = {d for r in db.execute("SELECT directions FROM specialists WHERE status = 'approved'") for d in json.loads(r["directions"])}
    return base + sorted(used - set(base))


@router.get("/profile")
def get_profile(user: CurrentUser):
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE user_id = ?", (user["id"],)).fetchone()
        directions = _directions(db)
        mine = [{"slug": r["slug"], "title": r["title"]} for r in db.execute(
            "SELECT slug, title FROM projects WHERE author_id = ? ORDER BY id DESC", (user["id"],))]
    return {"profile": _profile_out(row) if row else None, "directions": directions, "my_projects": mine,
            "account_type": user.get("account_type", "person")}


def _contacts(data: ProfileIn) -> list[dict]:
    out = []
    if data.telegram:
        tg = data.telegram
        url = f"https://t.me/{tg[1:]}" if tg.startswith("@") else tg
        out.append({"label": "Telegram", "icon": "send", "url": url})
    if data.website:
        out.append({"label": "Сайт", "icon": "link", "url": data.website})
    return out


def _portfolio(db, data: ProfileIn, old: list[dict], user_id: int) -> list[dict]:
    """Работы портфолио трёх типов. Новые картинки сохраняются, старые неиспользуемые — удаляются."""
    from ..config import IMG_URL
    kept = set()
    old_covers = {w.get("cover") for w in old}
    out = []
    for w in data.portfolio:
        item = {"type": w.type, "title": w.title.strip(), "meta": w.meta.strip(), "description": w.description.strip()}
        cover = w.cover.strip()
        if cover.startswith(IMG_URL):
            cover = cover[len(IMG_URL):]            # демо-картинка: храним относительный путь
        if cover not in old_covers:
            cover = ""                              # чужие пути не принимаем — только уже сохранённые картинки
        if w.image_data:
            cover = save_image(w.image_data, "work")
        if w.type == "video":
            if not w.video_url or not any(h in w.video_url for h in VIDEO_HOSTS):
                raise HTTPException(status_code=422, detail="Видео: укажите ссылку на YouTube, VK Видео, Rutube или Vimeo")
            item["video_url"] = w.video_url
        if w.type == "project":
            if w.project_slug:
                p = db.execute("SELECT slug, title, cover FROM projects WHERE slug = ? AND (status = 'approved' OR author_id = ?)",
                               (w.project_slug, user_id)).fetchone()
                if not p:
                    raise HTTPException(status_code=422, detail="Проект для портфолио не найден")
                item["project_slug"] = p["slug"]
                cover = cover or p["cover"]
            elif not w.url:
                raise HTTPException(status_code=422, detail="Проект: выберите свой проект или укажите ссылку")
            item["url"] = w.url
        item["cover"] = cover
        kept.add(cover)
        out.append(item)
    for w in old:
        if w.get("cover") not in kept:
            remove_upload(w.get("cover"))
    return out


@router.put("/profile")
def save_profile(data: ProfileIn, user: CurrentUser):
    status = "approved" if user["is_admin"] else "pending"
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE user_id = ?", (user["id"],)).fetchone()
        slug = row["slug"] if row else unique_slug(data.name)
        old = json.loads(row["details"]) if row else {}
        details = {
            "bio": data.bio.strip(),
            "skills": data.skills,
            "work_format": "Проектная работа" + (" · " + " / ".join(data.formats) if data.formats else ""),
            "contacts": _contacts(data),
            "portfolio": _portfolio(db, data, old.get("portfolio", []), user["id"]),
            "experience": [e.model_dump() for e in data.experience],
            **{k: old[k] for k in KEPT_DETAILS if k in old},
        }
        details.setdefault("reviews", [])
        avatar = row["avatar"] if row else content.avatar_path(slug)
        if data.avatar_data:
            remove_upload(avatar)
            avatar = save_image(data.avatar_data, "avatar")
        cover = next((w["cover"] for w in details["portfolio"] if w.get("cover")), row["cover"] if row else "")
        about = data.bio.strip().split(". ")[0].rstrip(".") + "."
        values = (data.kind, data.name.strip(), data.role.strip(), data.city.strip(),
                  json.dumps(data.formats, ensure_ascii=False), json.dumps(data.directions, ensure_ascii=False),
                  json.dumps(data.tags, ensure_ascii=False), about[:240], int(data.open),
                  json.dumps(details, ensure_ascii=False), status, avatar, cover)
        if row:
            db.execute(
                """UPDATE specialists SET kind=?, name=?, role=?, city=?, formats=?, directions=?, tags=?, about=?, open=?,
                   details=?, status=?, avatar=?, cover=?, moderation_note='' WHERE id = ?""", (*values, row["id"]))
        else:
            db.execute(
                """INSERT INTO specialists (kind, name, role, city, formats, directions, tags, about, open, details, status,
                   avatar, cover, slug, user_id, verified, popularity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)""",
                (*values, slug, user["id"]))
        if data.kind == "studio" and user.get("account_type") != "org":
            db.execute("UPDATE users SET account_type = 'org' WHERE id = ?", (user["id"],))
        elif data.kind == "person" and user.get("account_type") == "org":
            db.execute("UPDATE users SET account_type = 'person' WHERE id = ?", (user["id"],))
        row = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
    return {"profile": _profile_out(row)}


@router.get("/settings")
def get_settings(user: CurrentUser):
    with get_db() as db:
        urow = db.execute("SELECT settings FROM users WHERE id = ?", (user["id"],)).fetchone()
        profile = social.profile_of_user(db, user["id"])
        details = json.loads(profile["details"]) if profile else {}
        projects = []
        if profile:
            for r in db.execute("SELECT slug, title, team, owner_slug, author_id, closed FROM projects WHERE status = 'approved' OR author_id = ?", (user["id"],)):
                if r["owner_slug"] == profile["slug"] or r["author_id"] == user["id"] or any(m["slug"] == profile["slug"] for m in json.loads(r["team"])):
                    projects.append({"slug": r["slug"], "title": r["title"], "closed": bool(r["closed"]),
                                     "founder": r["owner_slug"] == profile["slug"] or r["author_id"] == user["id"]})
    s = social.user_settings(urow)
    return {"show_online": s.get("show_online", "all"), "hidden_projects": details.get("hidden_projects", []),
            "blog_visibility": details.get("blog_visibility", "all"), "projects": projects, "has_profile": bool(profile),
            "account_type": user.get("account_type", "person")}


@router.put("/settings")
def put_settings(data: SettingsIn, user: CurrentUser):
    with get_db() as db:
        urow = db.execute("SELECT settings FROM users WHERE id = ?", (user["id"],)).fetchone()
        s = social.user_settings(urow) | {"show_online": data.show_online}
        db.execute("UPDATE users SET settings = ? WHERE id = ?", (json.dumps(s), user["id"]))
        profile = social.profile_of_user(db, user["id"])
        if profile:
            details = json.loads(profile["details"])
            details["hidden_projects"] = list(dict.fromkeys(data.hidden_projects))
            details["blog_visibility"] = data.blog_visibility
            db.execute("UPDATE specialists SET details = ? WHERE id = ?", (json.dumps(details, ensure_ascii=False), profile["id"]))
    return get_settings(user)


@router.get("/org")
def get_org(user: CurrentUser):
    with get_db() as db:
        profile = social.profile_of_user(db, user["id"])
        if not profile or profile["kind"] != "studio":
            raise HTTPException(status_code=404, detail="Сначала заполните анкету организации")
        details = json.loads(profile["details"])
        flags = profile_flags(db)
        rows = {r["slug"]: r for r in db.execute("SELECT slug, name, role, avatar FROM specialists")}
    staff = []
    for m in details.get("staff", []):
        r = rows.get(m["slug"])
        if r:
            staff.append({**m, "name": r["name"], "avatar": img_url(r["avatar"]), "profile_role": r["role"],
                          "verified": flags.get(m["slug"], {}).get("verified", False)})
    return {"slug": profile["slug"], "name": profile["name"], "staff": staff,
            "staff_visibility": details.get("staff_visibility", "all"), "show_staff_count": details.get("show_staff_count", True)}


@router.put("/org")
def put_org(data: OrgIn, user: CurrentUser):
    with get_db() as db:
        profile = social.profile_of_user(db, user["id"])
        if not profile or profile["kind"] != "studio":
            raise HTTPException(status_code=404, detail="Сначала заполните анкету организации")
        details = json.loads(profile["details"])
        before = {m["slug"] for m in details.get("staff", [])}
        staff = []
        for m in data.staff:
            r = db.execute("SELECT slug, kind, user_id FROM specialists WHERE slug = ? AND status = 'approved'", (m.slug,)).fetchone()
            if not r or r["kind"] != "person" or r["slug"] == profile["slug"]:
                raise HTTPException(status_code=422, detail="Сотрудником можно добавить только опубликованную анкету специалиста")
            staff.append(m.model_dump())
            if m.slug not in before:
                social.notify(db, r["user_id"], "member", f"Организация «{profile['name']}» добавила вас в сотрудники",
                              f"/people/{profile['slug']}")
        details.update(staff=list({m["slug"]: m for m in staff}.values()), staff_visibility=data.staff_visibility,
                       show_staff_count=data.show_staff_count)
        db.execute("UPDATE specialists SET details = ? WHERE id = ?", (json.dumps(details, ensure_ascii=False), profile["id"]))
    return get_org(user)


@router.get("/applications")
def my_applications(user: CurrentUser):
    """Отклики пользователя: на какие проекты откликнулся и что ответили."""
    with get_db() as db:
        rows = db.execute(
            """SELECT a.id, a.role, a.message, a.status, a.conversation_id, a.created_at, p.slug, p.title, p.cover, p.owner_name
               FROM applications a JOIN projects p ON p.id = a.project_id WHERE a.user_id = ? ORDER BY a.id DESC""",
            (user["id"],)).fetchall()
        out = []
        for r in rows:
            replied = bool(r["conversation_id"] and db.execute(
                "SELECT 1 FROM messages WHERE conversation_id = ? AND (sender_id IS NULL OR sender_id != ?)",
                (r["conversation_id"], user["id"])).fetchone())
            out.append({"id": r["id"], "role": r["role"], "message": r["message"], "status": r["status"],
                        "conversation_id": r["conversation_id"], "created_at": r["created_at"], "replied": replied,
                        "project": {"slug": r["slug"], "title": r["title"], "cover": img_url(r["cover"]), "owner_name": r["owner_name"]}})
    return {"items": out}
