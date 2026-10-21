"""Демо-аккаунт: пользователь с анкетой, своим проектом, лайками, избранным, откликом, перепиской,
уведомлениями и записями в лентах.

Всё создаётся идемпотентно при каждом старте — даже если демо-контент был пересоздан.
Выключается переменной окружения SREDA_DEMO=0.
"""
import json
import sqlite3

from ..config import DEMO_EMAIL, DEMO_ENABLED, DEMO_NAME, DEMO_PASSWORD
from ..core.security import hash_password, verify_password
from ..services import content, social

DEMO_PROJECT_SLUG = "zerno-demo"
DEMO_PROFILE_SLUG = "demo-polzovatel"
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
        "conditions": "Гибрид, встречи в Алматы. Оплата по договору, дизайнерам — указание авторства на вывеске и в соцсетях.",
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
    _ensure_profile(db, user_id)
    if not db.execute("SELECT 1 FROM projects WHERE slug = ?", (DEMO_PROJECT_SLUG,)).fetchone():
        p = DEMO_PROJECT
        team = [{"slug": t, "name": people[t]["name"], "role": people[t]["role"], "avatar": content.avatar_path(t),
                 "can_post": t == TEAM[0], "visible": True} for t in TEAM if t in people]
        db.execute(
            """INSERT INTO projects (slug, title, description, category, tags, stage, roles, license, beta, cover,
               owner_slug, owner_name, owner_logo, team, details, likes, author_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (DEMO_PROJECT_SLUG, p["title"], p["description"], p["category"], json.dumps(p["tags"], ensure_ascii=False),
             p["stage"], json.dumps(p["roles"], ensure_ascii=False), p["license"], 0,
             content.project_cover_path(DEMO_PROJECT_SLUG), DEMO_PROFILE_SLUG, DEMO_NAME, "", json.dumps(team, ensure_ascii=False),
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

    row = db.execute("SELECT id, owner_slug, title FROM projects WHERE slug = ?", (APPLIED_TO,)).fetchone()
    if row and not db.execute("SELECT 1 FROM applications WHERE user_id = ? AND project_id = ?", (user_id, row["id"])).fetchone():
        message = "Хочу помочь с личным кабинетом и анимациями."
        conv = social.open_conversation(db, user_id, None, row["owner_slug"], row["id"])
        social.add_message(db, conv, user_id, "Отклик на роль «Фронтенд-разработчик»\n\n" + message)
        social.add_message(db, conv, None, "Спасибо за отклик! Посмотрели ваш профиль — давайте попробуем. "
                                           "Пришлю доступы к макетам личного кабинета. (Это демо-анкета: ответ пришёл автоматически.)")
        db.execute("INSERT INTO applications (user_id, project_id, role, message, status, conversation_id) VALUES (?,?,?,?,?,?)",
                   (user_id, row["id"], "Фронтенд-разработчик", message, "accepted", conv))
        social.notify(db, user_id, "application_status", f"Отклик на проект «{row['title']}» принят — добро пожаловать в команду!",
                      f"/messages?c={conv}")

    _ensure_social(db, user_id, people)


def _ensure_profile(db: sqlite3.Connection, user_id: int) -> None:
    """Опубликованная анкета демо-пользователя: с ней видно «Основатель» в профиле и можно вести блог."""
    if db.execute("SELECT 1 FROM specialists WHERE user_id = ?", (user_id,)).fetchone():
        return
    details = {"bio": "Собираю команды под городские и творческие проекты. Сейчас запускаю кофейню-коворкинг «Зерно».",
               "skills": ["Управление проектами", "Продюсирование", "Мероприятия"], "work_format": "Проектная работа · Гибрид",
               "contacts": [], "portfolio": [], "experience": [{"place": "Зерно", "role": "Основатель", "period": "2026"}],
               "reviews": [], "hidden_projects": [], "blog_visibility": "all"}
    db.execute(
        """INSERT INTO specialists (slug, kind, name, role, avatar, cover, city, formats, directions, tags, about, verified, open,
           popularity, details, user_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1,0,?,?,'approved')""",
        (DEMO_PROFILE_SLUG, "person", DEMO_NAME, "Продюсер проектов", "", "", "Алматы", json.dumps(["Гибрид"], ensure_ascii=False),
         json.dumps(["Управление проектами", "Продакшн"], ensure_ascii=False), json.dumps(["Продюсирование"], ensure_ascii=False),
         "Собираю команды под городские и творческие проекты.", json.dumps(details, ensure_ascii=False), user_id))


def _post(db, owner_type: str, owner_slug: str, author_name: str, author_slug: str | None, kind: str, title: str,
          body: str = "", image: str = "", poll: tuple = (), author_id: int | None = None) -> None:
    if db.execute("SELECT 1 FROM posts WHERE owner_type = ? AND owner_slug = ? AND title = ?", (owner_type, owner_slug, title)).fetchone():
        return
    db.execute("""INSERT INTO posts (owner_type, owner_slug, author_id, author_name, author_slug, kind, title, body, image, poll)
                  VALUES (?,?,?,?,?,?,?,?,?,?)""",
               (owner_type, owner_slug, author_id, author_name, author_slug, kind, title, body, image,
                json.dumps(list(poll), ensure_ascii=False)))


SEED_POSTS = [
    ("profile", "anna-mironova", "post", "Как мы собираем дизайн-систему за неделю",
     "Начинаем с аудита экранов, потом токены, потом компоненты. Главное — договориться о названиях до первой кнопки."),
    ("profile", "forma-studio", "result", "Запустили сайт для фестиваля «Новая форма»",
     "Три недели, четыре человека и одна большая анимация на главной. Спасибо команде!"),
    ("project", "pulse", "result", "Бета открыта для первых 300 человек",
     "Собрали обратную связь от тестировщиков: больше всего просят тёмную тему и напоминания."),
    ("project", "orbita", "poll", "Где провести следующую встречу команды?", ""),
]


def _ensure_social(db: sqlite3.Connection, user_id: int, people: dict) -> None:
    # переписка с участницей команды «Зерна»: последнее сообщение не прочитано
    mila = "mila-osipova"
    if mila in people and not db.execute("SELECT 1 FROM conversations WHERE user_a = ? AND peer_slug = ? AND project_id IS NULL",
                                         (user_id, mila)).fetchone():
        conv = social.open_conversation(db, user_id, None, mila)
        social.add_message(db, conv, user_id, "Мила, привет! Посмотрите, пожалуйста, мудборд вывески — ссылка в проекте.")
        social.add_message(db, conv, None, "Привет! Посмотрела — нравится второй вариант, с тёплым светом. Набросаю эскизы к пятнице.")

    # лента проекта «Зерно»: результат и опрос; блог демо-пользователя
    zerno = db.execute("SELECT cover FROM projects WHERE slug = ?", (DEMO_PROJECT_SLUG,)).fetchone()
    _post(db, "project", DEMO_PROJECT_SLUG, DEMO_NAME, DEMO_PROFILE_SLUG, "result", "Готов первый вариант вывески",
          "Мила собрала три варианта вывески. Выбрали тёплую подсветку и шрифт без засечек — дальше меню и стаканы.",
          zerno["cover"] if zerno else "", author_id=user_id)
    _post(db, "project", DEMO_PROJECT_SLUG, DEMO_NAME, DEMO_PROFILE_SLUG, "poll", "Какой напиток сделать фирменным?",
          poll=("Раф с лавандой", "Апельсиновый эспрессо-тоник", "Какао с кардамоном"), author_id=user_id)
    _post(db, "profile", DEMO_PROFILE_SLUG, DEMO_NAME, DEMO_PROFILE_SLUG, "post", "Почему кофейня-коворкинг",
          "Полгода искал место, где можно спокойно поработать и встретиться с командой. Не нашёл — решил сделать сам.",
          author_id=user_id)
    # блоги и ленты демо-контента
    for owner_type, slug, kind, title, body in SEED_POSTS:
        if owner_type == "profile":
            row = db.execute("SELECT name, slug AS author FROM specialists WHERE slug = ?", (slug,)).fetchone()
        else:
            row = db.execute("SELECT owner_name AS name, owner_slug AS author FROM projects WHERE slug = ?", (slug,)).fetchone()
        if row:
            _post(db, owner_type, slug, row["name"], row["author"], kind, title, body,
                  poll=("Онлайн", "В коворкинге", "На выезде за городом") if kind == "poll" else ())

    if not db.execute("SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'member'", (user_id,)).fetchone():
        social.notify(db, user_id, "member", "Мила Осипова присоединилась к команде проекта «Зерно»", f"/projects/{DEMO_PROJECT_SLUG}")
        social.notify(db, user_id, "post", "Новая запись в ленте проекта «Пульс»", "/projects/pulse#feed")
