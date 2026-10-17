"""Админ-панель: модерация анкет и проектов, выбор героев главной страницы, пользователи."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..services.serializers import project_out, specialist_out
from ..services.settings import FEATURED_KEY, get_setting, set_setting
from ..web.dependencies import AdminUser


class ModerateIn(BaseModel):
    action: str                                # approve | reject
    note: str = Field(default="", max_length=500)

    @field_validator("action")
    @classmethod
    def action_known(cls, v: str) -> str:
        if v not in ("approve", "reject"):
            raise ValueError("Неизвестное действие")
        return v


class FeaturedIn(BaseModel):
    freelancer: str = ""   # slug специалиста
    team: str = ""         # slug студии/команды
    project: str = ""


router = APIRouter(prefix="/api/admin", tags=["admin"])

STATUSES = ("pending", "approved", "rejected")


@router.get("/stats")
def stats(_: AdminUser):
    with get_db() as db:
        count = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
        return {
            "users": count("SELECT COUNT(*) FROM users"),
            "specialists": count("SELECT COUNT(*) FROM specialists WHERE status = 'approved'"),
            "projects": count("SELECT COUNT(*) FROM projects WHERE status = 'approved'"),
            "pending_specialists": count("SELECT COUNT(*) FROM specialists WHERE status = 'pending'"),
            "pending_projects": count("SELECT COUNT(*) FROM projects WHERE status = 'pending'"),
            "applications": count("SELECT COUNT(*) FROM applications"),
            "invitations": count("SELECT COUNT(*) FROM invitations"),
        }


@router.get("/moderation")
def moderation_queue(_: AdminUser, status: str = Query("pending")):
    if status not in STATUSES:
        raise HTTPException(status_code=422, detail="Неизвестный статус")
    with get_db() as db:
        specs = db.execute(
            """SELECT s.*, u.name AS user_name, u.email AS user_email FROM specialists s
               LEFT JOIN users u ON u.id = s.user_id WHERE s.status = ? AND s.user_id IS NOT NULL ORDER BY s.id DESC""",
            (status,)).fetchall()
        projs = db.execute(
            """SELECT p.*, u.name AS user_name, u.email AS user_email FROM projects p
               LEFT JOIN users u ON u.id = p.author_id WHERE p.status = ? AND p.author_id IS NOT NULL ORDER BY p.id DESC""",
            (status,)).fetchall()
    submitter = lambda r: {"name": r["user_name"], "email": r["user_email"]}  # noqa: E731
    return {
        "specialists": [{**specialist_out(r, full=True), "moderation_note": r["moderation_note"], "submitter": submitter(r)} for r in specs],
        "projects": [{**project_out(r), "moderation_note": r["moderation_note"], "created_at": r["created_at"], "submitter": submitter(r)} for r in projs],
    }


def _moderate(table: str, slug: str, data: ModerateIn) -> dict:
    if data.action == "reject" and not data.note.strip():
        raise HTTPException(status_code=422, detail="Укажите причину отклонения — автор её увидит")
    status = "approved" if data.action == "approve" else "rejected"
    with get_db() as db:
        cur = db.execute(f"UPDATE {table} SET status = ?, moderation_note = ? WHERE slug = ?",
                         (status, data.note.strip() if status == "rejected" else "", slug))
        if not cur.rowcount:
            raise HTTPException(status_code=404, detail="Не найдено")
    return {"ok": True, "status": status}


@router.post("/specialists/{slug}/moderate")
def moderate_specialist(slug: str, data: ModerateIn, _: AdminUser):
    return _moderate("specialists", slug, data)


@router.post("/projects/{slug}/moderate")
def moderate_project(slug: str, data: ModerateIn, _: AdminUser):
    return _moderate("projects", slug, data)


@router.get("/featured")
def get_featured(_: AdminUser):
    with get_db() as db:
        return get_setting(db, FEATURED_KEY, {"freelancer": "", "team": "", "project": ""})


@router.put("/featured")
def put_featured(data: FeaturedIn, _: AdminUser):
    """Кого показывать на главной: топ-специалист, команда (студия) и проект. Пустое значение — выбор автоматически."""
    checks = [("freelancer", "specialists", "kind = 'person'", "Специалист"), ("team", "specialists", "kind = 'studio'", "Команда"),
              ("project", "projects", "1 = 1", "Проект")]
    with get_db() as db:
        for field, table, cond, label in checks:
            slug = getattr(data, field)
            if slug and not db.execute(f"SELECT 1 FROM {table} WHERE slug = ? AND status = 'approved' AND {cond}", (slug,)).fetchone():
                raise HTTPException(status_code=422, detail=f"{label} не найден среди опубликованных")
        set_setting(db, FEATURED_KEY, data.model_dump())
    return data.model_dump()


@router.get("/users")
def users(_: AdminUser):
    with get_db() as db:
        rows = db.execute(
            """SELECT u.id, u.name, u.email, u.is_admin, u.created_at,
                      (SELECT status FROM specialists s WHERE s.user_id = u.id) AS profile_status,
                      (SELECT COUNT(*) FROM projects p WHERE p.author_id = u.id) AS projects
               FROM users u ORDER BY u.id DESC""").fetchall()
    return [{**dict(r), "is_admin": bool(r["is_admin"])} for r in rows]


class AdminFlagIn(BaseModel):
    is_admin: bool


@router.post("/users/{user_id}/admin")
def set_admin(user_id: int, data: AdminFlagIn, admin: AdminUser):
    if user_id == admin["id"] and not data.is_admin:
        raise HTTPException(status_code=400, detail="Нельзя снять права администратора с самого себя")
    with get_db() as db:
        cur = db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(data.is_admin), user_id))
        if not cur.rowcount:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
    return {"ok": True, "is_admin": data.is_admin}
