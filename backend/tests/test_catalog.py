def test_demo_content_seeded(client):
    assert client.get("/api/specialists").json()["total"] == 30
    assert client.get("/api/specialists?kind=studio").json()["total"] == 4
    assert client.get("/api/projects?limit=50").json()["total"] == 21  # 20 из content/ + проект демо-аккаунта


def test_specialist_filters(client):
    design = client.get("/api/specialists", params={"direction": "Дизайн"}).json()
    assert design["total"] > 0
    assert all("Дизайн" in s["directions"] for s in design["items"])
    moscow = client.get("/api/specialists", params={"city": "Москва", "format": "Удалённо"}).json()
    assert all(s["city"] == "Москва" and "Удалённо" in s["formats"] for s in moscow["items"])


def test_profile_has_participation_and_portfolio(client):
    anna = client.get("/api/specialists/anna-mironova").json()
    assert len(anna["details"]["portfolio"]) >= 2
    assert {p["title"] for p in anna["details"]["participation"]} >= {"Среда для идей"}
    assert client.get("/api/specialists/nobody").status_code == 404


def test_hero_team_is_pulse(client):
    items = client.get("/api/projects?limit=50").json()["items"]
    biggest = max(items, key=lambda p: len(p["team"]))
    assert biggest["slug"] == "pulse"
    assert [m["role"] for m in biggest["team"]] == [
        "ML-инженер", "Продуктовый дизайнер", "Фронтенд-разработчик", "UX-исследователь", "Аналитик данных"]


def test_projects_pagination_and_filters(client):
    page = client.get("/api/projects", params={"limit": 3, "offset": 3}).json()
    assert len(page["items"]) == 3
    assert all(p["beta"] for p in client.get("/api/projects?beta=true&limit=50").json()["items"])
    assert all(p["roles"] for p in client.get("/api/projects?has_roles=true&limit=50").json()["items"])


def test_likes_bookmarks_invites_require_auth(client):
    assert client.post("/api/projects/1/like").status_code == 401
    assert client.post("/api/specialists/anna-mironova/bookmark").status_code == 401


def test_like_toggle_and_create_project(client, user):
    first = client.post("/api/projects/1/like").json()
    second = client.post("/api/projects/1/like").json()
    assert first["liked"] and not second["liked"] and second["likes"] == first["likes"] - 1
    assert client.post("/api/specialists/anna-mironova/bookmark").json()["bookmarked"] is True
    assert client.post("/api/specialists/anna-mironova/invite", json={"message": "Привет, давайте работать"}).status_code == 201
    r = client.post("/api/projects", json={"title": "Тест", "description": "Описание тестового проекта",
                                          "category": "Игры", "stage": "Идея", "roles": ["Художник"]})
    assert r.status_code == 201 and r.json()["owner_name"] == "Тест Тестов"


def test_search_and_pages(client):
    found = client.get("/api/search", params={"q": "дизайн"}).json()
    assert found["people"] or found["studios"]
    for path in ["/", "/login", "/register", "/services", "/projects", "/about", "/people/anna-mironova", "/projects/orbita"]:
        assert client.get(path).status_code == 200, path


def test_project_page_and_apply(client, user):
    p = client.get("/api/projects/orbita").json()
    assert p["owner"]["slug"] == "orbita-team" and len(p["related"]) == 3 and p["applied"] is False
    assert client.get("/api/projects/nothing").status_code == 404
    assert client.post("/api/projects/orbita/apply", json={"role": "Unity-разработчик", "message": "Хочу в команду!"}).status_code == 201
    assert client.get("/api/projects/orbita").json()["applied"] is True


def test_static_assets_served(client):
    for path in ["/assets/css/main.css", "/assets/js/main.js", "/assets/js/pages/hero-motion.js", "/assets/img/favicon.svg"]:
        assert client.get(path).status_code == 200, path


def test_project_details_present(client):
    p = client.get("/api/projects/pulse").json()
    d = p["details"]
    assert len(d["about"]) >= 1 and d["problem"] and d["solution"]
    assert d["goals"] and d["roadmap"] and d["updates"]
    assert set(p["roles"]) <= set(d["role_details"])
    assert all(client.get(f"/api/projects/{x['slug']}").json()["details"].get("about")
               for x in client.get("/api/projects?limit=50").json()["items"])


def test_duplicate_apply_and_own_project(client, user):
    assert client.post("/api/projects/pulse/apply", json={"message": "Хочу помочь с бэкендом"}).status_code == 201
    assert client.post("/api/projects/pulse/apply", json={"message": "Ещё раз"}).status_code == 409
    own = client.post("/api/projects", json={"title": "Город будущего 2", "description": "Описание нового проекта",
                                             "category": "Архитектура", "stage": "Идея", "roles": ["Урбанист", "Урбанист"]}).json()
    assert own["slug"].startswith("gorod-buduschego-2-") and own["roles"] == ["Урбанист"]
    page = client.get(f"/api/projects/{own['slug']}").json()
    assert page["is_author"] is True
    assert client.post(f"/api/projects/{own['slug']}/apply", json={"message": "Сам себе"}).status_code == 400
    mine = client.get("/api/projects?mine=true&limit=50").json()
    assert [p["slug"] for p in mine["items"]] == [own["slug"]]


def test_validation_messages_are_russian(client, user):
    r = client.post("/api/auth/login", json={"email": "a@example.com", "password": ""}).json()
    assert r["errors"]["password"] == "Обязательное поле"
    r = client.post("/api/projects", json={"title": "А", "description": "коротко", "category": "Игры", "stage": "Идея"}).json()
    assert r["errors"] == {"title": "Минимум 2 символа", "description": "Минимум 10 символов"}


def test_cache_headers(client):
    assert client.get("/login").headers["cache-control"] == "no-cache"
    assert client.get("/assets/js/main.js").headers["cache-control"] == "no-cache"
    assert client.get("/assets/img/favicon.svg").headers["cache-control"].startswith("public")
    assert client.get("/api/auth/me").headers["cache-control"] == "no-store"
