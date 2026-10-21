"""Сообщения: диалоги между участниками, переписка по откликам. Новые сообщения подтягиваются опросом."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db import get_db
from ..services import social
from ..services.serializers import img_url, profile_flags, specialist_out
from ..web.dependencies import CurrentUser


class StartIn(BaseModel):
    to_slug: str = Field(min_length=1, max_length=120)    # анкета собеседника
    message: str = Field(min_length=1, max_length=2000)


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


router = APIRouter(prefix="/api/conversations", tags=["messages"])


def _party(db, user_id: int | None, slug: str | None, viewer: dict) -> dict:
    """Собеседник глазами viewer: анкета (если есть) или просто имя пользователя."""
    profile = None
    if slug:
        profile = db.execute("SELECT * FROM specialists WHERE slug = ?", (slug,)).fetchone()
    if not profile and user_id:
        profile = social.profile_of_user(db, user_id)
    if profile:
        s = specialist_out(profile)
        return {"name": s["name"], "slug": s["slug"] if profile["status"] == "approved" else None, "avatar": s["avatar"],
                "kind": s["kind"], "verified": s["verified"], "role": s["role"],
                "presence": social.presence(db, profile["user_id"], viewer, None if profile["user_id"] else profile["slug"])}
    u = db.execute("SELECT name FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None
    return {"name": u["name"] if u else "Пользователь", "slug": None, "avatar": None, "kind": "person", "verified": False,
            "role": "", "presence": social.presence(db, user_id, viewer)}


def _conversation(db, conversation_id: int, user: dict):
    c = db.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    if not c or user["id"] not in (c["user_a"], c["user_b"]):
        raise HTTPException(status_code=404, detail="Диалог не найден")
    return c


def _peer(db, c, user: dict) -> dict:
    if c["user_a"] == user["id"]:
        return _party(db, c["user_b"], c["peer_slug"], user)
    return _party(db, c["user_a"], None, user)


def _project(db, c) -> dict | None:
    if not c["project_id"]:
        return None
    p = db.execute("SELECT slug, title, cover FROM projects WHERE id = ?", (c["project_id"],)).fetchone()
    return {"slug": p["slug"], "title": p["title"], "cover": img_url(p["cover"])} if p else None


def _demo_answer(db, conversation_id: int, slug: str) -> None:
    """Демо-анкета без владельца отвечает сразу — чтобы в демо было видно, как работает переписка."""
    n = db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = ?", (conversation_id,)).fetchone()[0]
    social.add_message(db, conversation_id, None, social.demo_reply(slug, n))


@router.get("")
def list_conversations(user: CurrentUser):
    with get_db() as db:
        rows = db.execute("SELECT * FROM conversations WHERE user_a = ? OR user_b = ? ORDER BY updated_at DESC, id DESC",
                          (user["id"], user["id"])).fetchall()
        items = []
        for c in rows:
            last = db.execute("SELECT body, sender_id, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
                              (c["id"],)).fetchone()
            if not last:
                continue
            read = db.execute("SELECT last_read FROM conversation_reads WHERE conversation_id = ? AND user_id = ?",
                              (c["id"], user["id"])).fetchone()
            unread = db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND id > ? AND (sender_id IS NULL OR sender_id != ?)",
                                (c["id"], read["last_read"] if read else 0, user["id"])).fetchone()[0]
            items.append({"id": c["id"], "peer": _peer(db, c, user), "project": _project(db, c), "unread": unread,
                          "last": {"body": last["body"][:140], "mine": last["sender_id"] == user["id"], "created_at": last["created_at"]}})
    return {"items": items}


@router.post("", status_code=201)
def start(data: StartIn, user: CurrentUser):
    """Написать владельцу анкеты. Повторный вызов продолжает существующий диалог."""
    with get_db() as db:
        s = db.execute("SELECT slug, user_id FROM specialists WHERE slug = ? AND status = 'approved'", (data.to_slug,)).fetchone()
        if not s:
            raise HTTPException(status_code=404, detail="Профиль не найден")
        if s["user_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="Нельзя написать самому себе")
        conv = social.open_conversation(db, user["id"], s["user_id"], s["slug"])
        social.add_message(db, conv, user["id"], data.message.strip())
        if not s["user_id"]:
            _demo_answer(db, conv, s["slug"])
    return {"id": conv}


@router.get("/{conversation_id}")
def get_conversation(conversation_id: int, user: CurrentUser, after: int = 0):
    """Сообщения диалога (after — только новее этого id, для опроса) и отметка о прочтении."""
    with get_db() as db:
        c = _conversation(db, conversation_id, user)
        msgs = db.execute("SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id",
                          (conversation_id, after)).fetchall()
        if msgs:
            social.mark_read(db, conversation_id, user["id"], msgs[-1]["id"])
        application = None
        a = db.execute("SELECT id, status, role, user_id FROM applications WHERE conversation_id = ?", (conversation_id,)).fetchone()
        if a:
            p = db.execute("SELECT * FROM projects WHERE id = ?", (c["project_id"],)).fetchone() if c["project_id"] else None
            application = {"id": a["id"], "status": a["status"], "role": a["role"], "mine": a["user_id"] == user["id"],
                           "can_decide": bool(p and a["user_id"] != user["id"] and social.can_manage_project(user, p, profile_flags(db)))}
        out = {"id": c["id"], "peer": _peer(db, c, user), "project": _project(db, c), "application": application,
               "messages": [{"id": m["id"], "body": m["body"], "created_at": m["created_at"], "mine": m["sender_id"] == user["id"]}
                            for m in msgs]}
    return out


@router.post("/{conversation_id}/messages", status_code=201)
def send(conversation_id: int, data: MessageIn, user: CurrentUser):
    with get_db() as db:
        c = _conversation(db, conversation_id, user)
        mid = social.add_message(db, conversation_id, user["id"], data.body.strip())
        if c["user_b"] is None and c["peer_slug"]:
            _demo_answer(db, conversation_id, c["peer_slug"])
        m = db.execute("SELECT id, body, created_at FROM messages WHERE id = ?", (mid,)).fetchone()
    return {"id": m["id"], "body": m["body"], "created_at": m["created_at"], "mine": True}
