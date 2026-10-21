"""Главная страница: блок справа — топ-специалист, команда и проект (выбирает администратор)."""
import json

from fastapi import APIRouter

from ..db import get_db
from ..services.serializers import img_url, profile_flags, project_out, specialist_out
from ..services.settings import FEATURED_KEY, get_setting
from ..web.dependencies import OptionalUser

router = APIRouter(prefix="/api/home", tags=["home"])


def _pick(db, table: str, slug: str, cond: str, fallback_order: str):
    """Выбранный администратором элемент или, если не выбран / снят с публикации, — лучший автоматически."""
    if slug:
        row = db.execute(f"SELECT * FROM {table} WHERE slug = ? AND status = 'approved' AND {cond}", (slug,)).fetchone()
        if row:
            return row, True
    return db.execute(f"SELECT * FROM {table} WHERE status = 'approved' AND {cond} ORDER BY {fallback_order} LIMIT 1").fetchone(), False


@router.get("")
def home(user: OptionalUser):
    with get_db() as db:
        featured = get_setting(db, FEATURED_KEY, {}) or {}
        person, person_manual = _pick(db, "specialists", featured.get("freelancer", ""), "kind = 'person'", "popularity DESC")
        team, team_manual = _pick(db, "specialists", featured.get("team", ""), "kind = 'studio'", "popularity DESC")
        project, project_manual = _pick(db, "projects", featured.get("project", ""), "1 = 1",
                                        "json_array_length(roles) > 0 DESC, likes DESC")
        flags = profile_flags(db)
        thumbs = []
        if team:
            details = json.loads(team["details"])
            thumbs = [{"cover": img_url(w["cover"]), "title": w["title"]} for w in details.get("portfolio", [])]
            for r in db.execute("SELECT slug, title, cover, team, owner_slug FROM projects WHERE status = 'approved' ORDER BY likes DESC"):
                if r["owner_slug"] == team["slug"] or any(m["slug"] == team["slug"] for m in json.loads(r["team"])):
                    thumbs.append({"cover": img_url(r["cover"]), "title": r["title"]})
    return {
        "freelancer": specialist_out(person) | {"featured": person_manual} if person else None,
        "team": specialist_out(team) | {"thumbs": thumbs[:4], "featured": team_manual} if team else None,
        "project": project_out(project, flags=flags) | {"featured": project_manual} if project else None,
    }
