"""Жалобы на пользователей, организации, проекты и записи: плагиат, недопустимый контент, спам, мошенничество."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..db import get_db
from ..web.dependencies import CurrentUser

REASONS = {
    "plagiarism": "Плагиат или чужие работы",
    "inappropriate": "Недопустимый контент",
    "spam": "Спам или реклама",
    "fraud": "Мошенничество",
    "fake": "Выдаёт себя за другого",
    "other": "Другое",
}


class ReportIn(BaseModel):
    target_type: str                          # profile | project | post
    target_slug: str = Field(min_length=1, max_length=120)   # для поста — его id
    reason: str
    comment: str = Field(default="", max_length=1000)

    @field_validator("target_type")
    @classmethod
    def target_known(cls, v: str) -> str:
        if v not in ("profile", "project", "post"):
            raise ValueError("Неизвестный тип жалобы")
        return v

    @field_validator("reason")
    @classmethod
    def reason_known(cls, v: str) -> str:
        if v not in REASONS:
            raise ValueError("Выберите причину")
        return v


router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/reasons")
def reasons():
    return [{"value": k, "label": v} for k, v in REASONS.items()]


@router.post("", status_code=201)
def create_report(data: ReportIn, user: CurrentUser):
    if data.reason == "other" and len(data.comment.strip()) < 5:
        raise HTTPException(status_code=422, detail="Опишите, что не так, — хотя бы пару слов")
    with get_db() as db:
        if data.target_type == "profile":
            row = db.execute("SELECT name AS title, user_id AS owner FROM specialists WHERE slug = ?", (data.target_slug,)).fetchone()
        elif data.target_type == "project":
            row = db.execute("SELECT title, author_id AS owner FROM projects WHERE slug = ?", (data.target_slug,)).fetchone()
        else:
            row = db.execute("SELECT COALESCE(NULLIF(title, ''), substr(body, 1, 60)) AS title, author_id AS owner FROM posts WHERE id = ?",
                             (int(data.target_slug) if data.target_slug.isdigit() else 0,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Материал не найден")
        if row["owner"] == user["id"]:
            raise HTTPException(status_code=400, detail="Нельзя пожаловаться на свой материал")
        if db.execute("SELECT 1 FROM reports WHERE user_id = ? AND target_type = ? AND target_slug = ? AND status = 'open'",
                      (user["id"], data.target_type, data.target_slug)).fetchone():
            raise HTTPException(status_code=409, detail="Вы уже отправили жалобу — модератор её рассмотрит")
        db.execute("INSERT INTO reports (user_id, target_type, target_slug, target_title, reason, comment) VALUES (?,?,?,?,?,?)",
                   (user["id"], data.target_type, data.target_slug, row["title"] or "", data.reason, data.comment.strip()))
    return {"ok": True}
