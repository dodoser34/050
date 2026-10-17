"""Личный кабинет: анкета специалиста/студии. Каждое сохранение отправляет анкету на модерацию."""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..services import content
from ..services.serializers import specialist_out
from ..services.text import unique_slug
from ..web.dependencies import CurrentUser


class WorkIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    meta: str = Field(default="", max_length=80)


class ExperienceIn(BaseModel):
    place: str = Field(min_length=2, max_length=80)
    role: str = Field(default="", max_length=80)
    period: str = Field(default="", max_length=40)


class ProfileIn(BaseModel):
    kind: str = "person"                       # person | studio
    name: str = Field(min_length=2, max_length=80)
    role: str = Field(min_length=2, max_length=80)
    city: str = Field(min_length=2, max_length=60)
    formats: list[str] = Field(default_factory=list, max_length=3)
    directions: list[str] = Field(min_length=1, max_length=4)
    tags: list[str] = Field(default_factory=list, max_length=6)
    bio: str = Field(min_length=20, max_length=1200)
    skills: list[str] = Field(default_factory=list, max_length=12)
    telegram: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=200)
    open: bool = True
    portfolio: list[WorkIn] = Field(default_factory=list, max_length=8)
    experience: list[ExperienceIn] = Field(default_factory=list, max_length=8)

    @field_validator("kind")
    @classmethod
    def kind_known(cls, v: str) -> str:
        if v not in ("person", "studio"):
            raise ValueError("Выберите: специалист или студия")
        return v

    @field_validator("tags", "skills", "formats", "directions")
    @classmethod
    def clean_list(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(x.strip()[:40] for x in v if x.strip()))

    @field_validator("website", "telegram")
    @classmethod
    def link(cls, v: str) -> str:
        v = v.strip()
        if v and not v.startswith(("https://", "http://", "@")):
            raise ValueError("Ссылка должна начинаться с https:// (для Telegram можно @имя)")
        return v


router = APIRouter(prefix="/api/me", tags=["me"])


def _profile_out(row) -> dict:
    out = specialist_out(row, full=True)
    out.update(status=row["status"], moderation_note=row["moderation_note"])
    return out


@router.get("/profile")
def get_profile(user: CurrentUser):
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE user_id = ?", (user["id"],)).fetchone()
    return {"profile": _profile_out(row) if row else None, "directions": content.taxonomy()["directions"]}


def _contacts(data: ProfileIn) -> list[dict]:
    out = []
    if data.telegram:
        tg = data.telegram
        url = f"https://t.me/{tg[1:]}" if tg.startswith("@") else tg
        out.append({"label": "Telegram", "icon": "send", "url": url})
    if data.website:
        out.append({"label": "Сайт", "icon": "link", "url": data.website})
    return out


@router.put("/profile")
def save_profile(data: ProfileIn, user: CurrentUser):
    unknown = set(data.directions) - set(content.taxonomy()["directions"])
    if unknown:
        raise HTTPException(status_code=422, detail=f"Неизвестное направление: {', '.join(sorted(unknown))}")
    status = "approved" if user["is_admin"] else "pending"
    with get_db() as db:
        row = db.execute("SELECT * FROM specialists WHERE user_id = ?", (user["id"],)).fetchone()
        slug = row["slug"] if row else unique_slug(data.name)
        details = {
            "bio": data.bio.strip(),
            "skills": data.skills,
            "work_format": "Проектная работа" + (" · " + " / ".join(data.formats) if data.formats else ""),
            "contacts": _contacts(data),
            "portfolio": [{"title": w.title, "meta": w.meta, "cover": content.portfolio_path(slug, i + 1)}
                          for i, w in enumerate(data.portfolio)],
            "experience": [e.model_dump() for e in data.experience],
            "reviews": json.loads(row["details"]).get("reviews", []) if row else [],
        }
        about = data.bio.strip().split(". ")[0].rstrip(".") + "."
        values = (data.kind, data.name.strip(), data.role.strip(), data.city.strip(),
                  json.dumps(data.formats, ensure_ascii=False), json.dumps(data.directions, ensure_ascii=False),
                  json.dumps(data.tags, ensure_ascii=False), about[:240], int(data.open),
                  json.dumps(details, ensure_ascii=False), status)
        if row:
            db.execute(
                """UPDATE specialists SET kind=?, name=?, role=?, city=?, formats=?, directions=?, tags=?, about=?, open=?,
                   details=?, status=?, moderation_note='' WHERE id = ?""", (*values, row["id"]))
        else:
            db.execute(
                """INSERT INTO specialists (kind, name, role, city, formats, directions, tags, about, open, details, status,
                   slug, avatar, cover, user_id, verified, popularity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)""",
                (*values, slug, content.avatar_path(slug), content.portfolio_path(slug, 1), user["id"]))
        row = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
    return {"profile": _profile_out(row)}
