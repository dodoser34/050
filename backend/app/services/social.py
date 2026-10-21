"""Общее для социальных функций: уведомления, статус «в сети», права участников, приватность команд."""
import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone

from ..config import ONLINE_WINDOW

VISIBILITY = ("all", "selected", "hidden")     # кого из команды / сотрудников видят посетители
SHOW_ONLINE = ("all", "contacts", "nobody")    # кому показывать статус «в сети»


def notify(db: sqlite3.Connection, user_id: int | None, kind: str, text: str, url: str = "") -> None:
    if user_id:
        db.execute("INSERT INTO notifications (user_id, kind, text, url) VALUES (?,?,?,?)", (user_id, kind, text[:300], url))


def user_settings(row) -> dict:
    try:
        return json.loads(row["settings"] or "{}")
    except (TypeError, ValueError, IndexError, KeyError):
        return {}


def profile_of_user(db: sqlite3.Connection, user_id: int | None):
    if not user_id:
        return None
    return db.execute("SELECT * FROM specialists WHERE user_id = ?", (user_id,)).fetchone()


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def demo_presence(slug: str) -> dict:
    """Демо-анкеты без владельца: правдоподобный статус, стабильный для каждой анкеты."""
    h = int(hashlib.sha1(slug.encode()).hexdigest(), 16)
    if h % 3 == 0:
        return {"online": True, "last_seen": _iso(time.time())}
    return {"online": False, "last_seen": _iso(time.time() - 600 - (h % 70) * 2400)}


def are_contacts(db: sqlite3.Connection, a: int, b: int) -> bool:
    return bool(db.execute(
        "SELECT 1 FROM conversations WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)", (a, b, b, a)).fetchone())


def presence(db: sqlite3.Connection, user_id: int | None, viewer: dict | None, slug: str | None = None) -> dict | None:
    """Статус «в сети» с учётом настройки приватности владельца. None — статус скрыт."""
    if not user_id:
        return demo_presence(slug) if slug else None
    row = db.execute("SELECT last_seen, settings FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    mode = user_settings(row).get("show_online", "all")
    own = bool(viewer and viewer["id"] == user_id)
    if not own and (mode == "nobody" or (mode == "contacts" and not (viewer and are_contacts(db, viewer["id"], user_id)))):
        return None
    last = row["last_seen"] or 0
    if not last:
        return None
    return {"online": time.time() - last < ONLINE_WINDOW, "last_seen": _iso(last)}


# ---------- Проекты: права и приватность команды ----------

def project_details(row) -> dict:
    return json.loads(row["details"] or "{}")


def member_user_ids(team: list[dict], flags: dict, only_posters: bool = False) -> set[int]:
    return {flags[m["slug"]]["user_id"] for m in team
            if m.get("slug") in flags and flags[m["slug"]]["user_id"] and (m.get("can_post") or not only_posters)}


def can_manage_project(user: dict | None, row, flags: dict) -> bool:
    """Редактировать проект, команду и отклики: автор, владелец анкеты-основателя или администратор."""
    if not user:
        return False
    owner = flags.get(row["owner_slug"] or "", {})
    return bool(user["is_admin"] or row["author_id"] == user["id"] or (owner.get("user_id") and owner["user_id"] == user["id"]))


def project_access(user: dict | None, row, flags: dict) -> dict:
    team = json.loads(row["team"])
    manage = can_manage_project(user, row, flags)
    uid = user["id"] if user else None
    member = bool(uid and uid in member_user_ids(team, flags))
    return {"can_manage": manage, "is_member": manage or member,
            "can_post": manage or bool(uid and uid in member_user_ids(team, flags, only_posters=True))}


def apply_team_privacy(project: dict, details: dict, full_access: bool) -> dict:
    """Скрывает участников по настройке проекта. Количество показывается, если владелец это разрешил."""
    visibility = details.get("team_visibility", "all")
    project["team_visibility"] = visibility
    project["show_team_count"] = details.get("show_team_count", True)
    if full_access or visibility == "all":
        return project
    team = project["team"]
    project["team"] = [m for m in team if m.get("visible", True)] if visibility == "selected" else []
    project["team_count"] = len(team) if project["show_team_count"] else None
    return project


# ---------- Организации: сотрудники ----------

def profile_access(user: dict | None, row, flags: dict) -> dict:
    """Кто может вести блог анкеты: владелец; у организации — ещё сотрудники с правом публикации."""
    details = json.loads(row["details"] or "{}")
    uid = user["id"] if user else None
    owner = bool(uid and row["user_id"] == uid)
    staff = details.get("staff", [])
    member = bool(uid and uid in member_user_ids(staff, flags))
    poster = bool(uid and uid in member_user_ids(staff, flags, only_posters=True))
    admin = bool(user and user["is_admin"])
    return {"is_owner": owner, "is_member": owner or member or admin, "can_post": owner or poster or admin}


def apply_staff_privacy(details: dict, full_access: bool) -> dict:
    visibility = details.get("staff_visibility", "all")
    staff = details.get("staff", [])
    details["staff_visibility"] = visibility
    details["show_staff_count"] = details.get("show_staff_count", True)
    details["staff_count"] = len(staff)
    if not full_access and visibility != "all":
        details["staff"] = [m for m in staff if m.get("visible", True)] if visibility == "selected" else []
        if not details["show_staff_count"]:
            details["staff_count"] = None
    return details


# ---------- Переписка ----------

DEMO_REPLIES = [
    "Здравствуйте! Спасибо, что написали — посмотрю подробнее и вернусь с ответом сегодня вечером.",
    "Привет! Звучит интересно. Можете прислать пару примеров или ссылку на материалы?",
    "Спасибо! Давайте созвонимся на неделе — когда вам удобно?",
    "Добрый день! Рада знакомству. Расскажите, какие сроки у проекта?",
]


def demo_reply(slug: str, n: int = 0) -> str:
    h = int(hashlib.sha1(slug.encode()).hexdigest(), 16)
    return DEMO_REPLIES[(h + n) % len(DEMO_REPLIES)] + " (Это демо-анкета: ответ пришёл автоматически.)"


def unread_messages(db: sqlite3.Connection, user_id: int) -> int:
    return db.execute(
        """SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
           LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.user_id = ?
           WHERE (c.user_a = ? OR c.user_b = ?) AND (m.sender_id IS NULL OR m.sender_id != ?)
             AND m.id > COALESCE(r.last_read, 0)""", (user_id, user_id, user_id, user_id)).fetchone()[0]


def open_conversation(db: sqlite3.Connection, user_a: int, user_b: int | None, peer_slug: str | None,
                      project_id: int | None = None) -> int:
    """Находит диалог этих сторон (по проекту — отдельный) или создаёт новый."""
    if user_b:
        row = db.execute(
            """SELECT id FROM conversations WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))
               AND COALESCE(project_id, 0) = ?""", (user_a, user_b, user_b, user_a, project_id or 0)).fetchone()
    else:
        row = db.execute("SELECT id FROM conversations WHERE user_a = ? AND user_b IS NULL AND peer_slug = ? AND COALESCE(project_id, 0) = ?",
                         (user_a, peer_slug, project_id or 0)).fetchone()
    if row:
        return row["id"]
    return db.execute("INSERT INTO conversations (user_a, user_b, peer_slug, project_id) VALUES (?,?,?,?)",
                      (user_a, user_b, peer_slug, project_id)).lastrowid


def add_message(db: sqlite3.Connection, conversation_id: int, sender_id: int | None, body: str) -> int:
    mid = db.execute("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)",
                     (conversation_id, sender_id, body)).lastrowid
    db.execute("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", (conversation_id,))
    if sender_id:
        mark_read(db, conversation_id, sender_id, mid)
    return mid


def mark_read(db: sqlite3.Connection, conversation_id: int, user_id: int, message_id: int) -> None:
    db.execute("""INSERT INTO conversation_reads (conversation_id, user_id, last_read) VALUES (?,?,?)
                  ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read = MAX(last_read, excluded.last_read)""",
               (conversation_id, user_id, message_id))
