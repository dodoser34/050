"""Уведомления и счётчики непрочитанного для шапки."""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from ..db import get_db
from ..services import social
from ..web.dependencies import CurrentUser


class ReadIn(BaseModel):
    ids: list[int] = Field(default_factory=list, max_length=500)   # пусто — прочитать все


router = APIRouter(prefix="/api", tags=["notifications"])


@router.get("/me/summary")
def summary(user: CurrentUser):
    with get_db() as db:
        unread = db.execute("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0", (user["id"],)).fetchone()[0]
        return {"unread_notifications": unread, "unread_messages": social.unread_messages(db, user["id"])}


@router.get("/notifications")
def list_notifications(user: CurrentUser, limit: int = Query(30, ge=1, le=100)):
    with get_db() as db:
        rows = db.execute("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user["id"], limit)).fetchall()
        unread = db.execute("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0", (user["id"],)).fetchone()[0]
    return {"unread": unread, "items": [{"id": r["id"], "kind": r["kind"], "text": r["text"], "url": r["url"],
                                         "read": bool(r["read"]), "created_at": r["created_at"]} for r in rows]}


@router.post("/notifications/read")
def read(data: ReadIn, user: CurrentUser):
    with get_db() as db:
        if data.ids:
            marks = ",".join("?" * len(data.ids))
            db.execute(f"UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN ({marks})", (user["id"], *data.ids))
        else:
            db.execute("UPDATE notifications SET read = 1 WHERE user_id = ?", (user["id"],))
    return {"ok": True}
