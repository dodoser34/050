"""Общий поиск по людям, студиям и проектам."""
from fastapi import APIRouter, Query

from ..db import get_db
from ..services.serializers import matches, project_out, specialist_out

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(q: str = Query("", max_length=100)):
    if len(q.strip()) < 2:
        return {"people": [], "studios": [], "projects": []}
    with get_db() as db:
        specialists = [specialist_out(r) for r in db.execute("SELECT * FROM specialists WHERE status = 'approved' ORDER BY popularity DESC")]
        projects = [project_out(r) for r in db.execute("SELECT * FROM projects WHERE status = 'approved' ORDER BY likes DESC")]
    found = [s for s in specialists if matches(q, s["name"], s["role"], s["tags"])]
    return {
        "people": [s for s in found if s["kind"] == "person"][:4],
        "studios": [s for s in found if s["kind"] == "studio"][:3],
        "projects": [p for p in projects if matches(q, p["title"], p["description"], p["tags"])][:4],
    }
