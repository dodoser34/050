"""Демо-аккаунт: пользователь со своим проектом, лайками, избранным и откликом.

Всё создаётся идемпотентно при каждом старте — даже если демо-контент был пересоздан.
Выключается переменной окружения SREDA_DEMO=0.
"""
import json
import sqlite3

from ..config import DEMO_EMAIL, DEMO_ENABLED, DEMO_NAME, DEMO_PASSWORD
from ..core.security import hash_password, verify_password
from ..services import content

DEMO_PROJECT_SLUG = "zerno-demo"
LIKED_PROJECTS = ["orbita", "pulse", "nochnoy-ekspress"]
BOOKMARKED = ["anna-mironova", "mark-volkov", "lera-sokolova"]
APPLIED_TO = "sreda-dlya-idey"
TEAM = ["mila-osipova", "yana-kuznetsova"]

DEMO_PROJECT = {
    "title": "Зерно",
    "description": "Кофейня-коворкинг для творческих людей: днём — рабочие места, вечером — показы и встречи.",
    "category": "Дизайн",
    "tags": ["Дизайн", "Архитектура"],
    "stage": "Идея",
    "roles": ["Бренд-дизайнер", "SMM-менеджер", "Бариста"],
    "license": "Закрытая",
    "details": {
        "about": [
            "«Зерно» — кофейня-коворкинг на первом этаже старого дома: днём здесь работают фрилансеры и маленькие команды, вечером проходят показы портфолио, лекции и встречи проектов из Среды.",
            "Мы хотим, чтобы у творческих людей района было место, где можно спокойно поработать, показать свою работу и найти единомышленников вживую.",
        ],
        "problem": "В районе нет места, где можно поработать дольше часа: кофейни шумные и тесные, коворкинги дорогие и безликие.",
        "solution": "Небольшое пространство с хорошим кофе, тихой зоной, большим столом для встреч и программой вечерних событий для сообщества.",
        "goals": ["Собрать айдентику и вывеску", "Найти помещение до 120 м²", "Запустить соцсети до открытия", "Провести 4 события в первый месяц"],
        "roadmap": [
            {"title": "Концепция и бюджет", "period": "март", "status": "done"},
            {"title": "Айдентика и интерьер", "period": "апрель — май", "status": "current"},
            {"title": "Ремонт и закупка", "period": "июнь — июль", "status": "next"},
            {"title": "Открытие", "period": "сентябрь", "status": "next"},
        ],
        "role_details": {
            "Бренд-дизайнер": "Нужен бренд-дизайнер: логотип, вывеска, стаканы, меню и навигация внутри пространства.",
            "SMM-менеджер": "Ищем SMM-менеджера, который запустит соцсети до открытия и будет анонсировать вечерние события.",
            "Бариста": "Ищем бариста с опытом, который поможет выстроить меню и закупку зерна.",
        },
        "updates": [
            {"date": "2 апр", "title": "Посмотрели три помещения", "text": "Лучшее — 96 м² с большими окнами на тихой улице. Ведём переговоры об аренде."},
        ],
        "conditions": "Гибрид, встречи в Москве. Оплата по договору, дизайнерам — указание авторства на вывеске и в соцсетях.",
        "links": [{"label": "Мудборд", "url": "https://example.com/zerno"}],
    },
}


def demo_user_id(db: sqlite3.Connection) -> int | None:
    row = db.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,)).fetchone()
    return row["id"] if row else None


def ensure_demo(db: sqlite3.Connection) -> None:
    if not DEMO_ENABLED:
        return
    user_id = demo_user_id(db)
    if user_id is None:
        user_id = db.execute("INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
                             (DEMO_NAME, DEMO_EMAIL, hash_password(DEMO_PASSWORD))).lastrowid
    else:
        row = db.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        if not verify_password(DEMO_PASSWORD, row["password_hash"]):  # пароль сменили в окружении
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(DEMO_PASSWORD), user_id))

    people = {s["slug"]: s for s in content.specialists()}
    if not db.execute("SELECT 1 FROM projects WHERE slug = ?", (DEMO_PROJECT_SLUG,)).fetchone():
        p = DEMO_PROJECT
        team = [{"slug": t, "name": people[t]["name"], "role": people[t]["role"], "avatar": content.avatar_path(t)}
                for t in TEAM if t in people]
        db.execute(
            """INSERT INTO projects (slug, title, description, category, tags, stage, roles, license, beta, cover,
               owner_name, owner_logo, team, details, likes, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (DEMO_PROJECT_SLUG, p["title"], p["description"], p["category"], json.dumps(p["tags"], ensure_ascii=False),
             p["stage"], json.dumps(p["roles"], ensure_ascii=False), p["license"], 0,
             content.project_cover_path(DEMO_PROJECT_SLUG), DEMO_NAME, "", json.dumps(team, ensure_ascii=False),
             json.dumps(p["details"], ensure_ascii=False), 12, user_id),
        )

    for slug in LIKED_PROJECTS:
        row = db.execute("SELECT id FROM projects WHERE slug = ?", (slug,)).fetchone()
        if row and not db.execute("SELECT 1 FROM likes WHERE user_id = ? AND project_id = ?", (user_id, row["id"])).fetchone():
            db.execute("INSERT INTO likes (user_id, project_id) VALUES (?,?)", (user_id, row["id"]))
            db.execute("UPDATE projects SET likes = likes + 1 WHERE id = ?", (row["id"],))

    for slug in BOOKMARKED:
        row = db.execute("SELECT id FROM specialists WHERE slug = ?", (slug,)).fetchone()
        if row:
            db.execute("INSERT OR IGNORE INTO bookmarks (user_id, specialist_id) VALUES (?,?)", (user_id, row["id"]))

    row = db.execute("SELECT id FROM projects WHERE slug = ?", (APPLIED_TO,)).fetchone()
    if row and not db.execute("SELECT 1 FROM applications WHERE user_id = ? AND project_id = ?", (user_id, row["id"])).fetchone():
        db.execute("INSERT INTO applications (user_id, project_id, role, message) VALUES (?,?,?,?)",
                   (user_id, row["id"], "Фронтенд-разработчик", "Хочу помочь с личным кабинетом и анимациями."))
