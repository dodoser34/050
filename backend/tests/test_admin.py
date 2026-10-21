PROFILE = {
    "kind": "person", "name": "Тест Специалист", "role": "Моушн-дизайнер", "city": "Москва",
    "formats": ["Удалённо"], "directions": ["3D и моушн"], "tags": ["After Effects"],
    "bio": "Делаю анимацию для интерфейсов и рекламы. Люблю аккуратные переходы.",
    "skills": ["After Effects", "Rive"], "telegram": "@test", "website": "",
    "portfolio": [{"title": "Шоурил", "meta": "2026"}], "experience": [],
}


def admin_login(client):
    r = client.post("/api/auth/demo", json={"role": "admin"})
    assert r.status_code == 200 and r.json()["is_admin"] is True


def test_admin_api_requires_admin(client, user):
    assert client.get("/api/admin/stats").status_code == 403
    client.post("/api/auth/logout")
    assert client.get("/api/admin/stats").status_code == 401


def test_profile_goes_through_moderation(client, user):
    saved = client.put("/api/me/profile", json=PROFILE).json()["profile"]
    slug = saved["slug"]
    assert saved["status"] == "pending" and slug.startswith("test-spetsialist-")
    # не видно в каталоге и поиске, но видно автору
    assert all(s["slug"] != slug for s in client.get("/api/specialists").json()["items"])
    assert client.get(f"/api/specialists/{slug}").json()["is_owner"] is True
    client.post("/api/auth/logout")
    assert client.get(f"/api/specialists/{slug}").status_code == 404

    admin_login(client)
    queue = client.get("/api/admin/moderation").json()
    assert [s["slug"] for s in queue["specialists"]] == [slug]
    assert client.post(f"/api/admin/specialists/{slug}/moderate", json={"action": "reject"}).status_code == 422
    assert client.post(f"/api/admin/specialists/{slug}/moderate", json={"action": "approve"}).json()["status"] == "approved"
    client.post("/api/auth/logout")
    assert any(s["slug"] == slug for s in client.get("/api/specialists").json()["items"])


def test_rejected_profile_shows_reason_and_edit_resubmits(client, user):
    slug = client.put("/api/me/profile", json=PROFILE).json()["profile"]["slug"]
    client.post("/api/auth/logout")
    admin_login(client)
    client.post(f"/api/admin/specialists/{slug}/moderate", json={"action": "reject", "note": "Добавьте работы в портфолио"})
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "test@example.com", "password": "password123"})
    me = client.get("/api/me/profile").json()["profile"]
    assert me["status"] == "rejected" and me["moderation_note"] == "Добавьте работы в портфолио"
    again = client.put("/api/me/profile", json={**PROFILE, "bio": PROFILE["bio"] + " Добавил новые работы."}).json()["profile"]
    assert again["slug"] == slug and again["status"] == "pending" and again["moderation_note"] == ""


def test_user_project_needs_approval(client, user):
    p = client.post("/api/projects", json={"title": "Новая идея", "description": "Описание новой идеи проекта",
                                           "category": "Игры", "stage": "Идея"}).json()
    assert p["status"] == "pending"
    assert all(x["slug"] != p["slug"] for x in client.get("/api/projects?limit=50").json()["items"])
    mine = client.get("/api/projects?mine=true&limit=50").json()["items"]
    assert mine[0]["slug"] == p["slug"] and mine[0]["status"] == "pending"
    client.post("/api/auth/logout")
    assert client.get(f"/api/projects/{p['slug']}").status_code == 404
    admin_login(client)
    client.post(f"/api/admin/projects/{p['slug']}/moderate", json={"action": "approve"})
    client.post("/api/auth/logout")
    assert client.get(f"/api/projects/{p['slug']}").status_code == 200


def test_featured_home(client):
    auto = client.get("/api/home").json()
    assert auto["freelancer"]["kind"] == "person" and auto["team"]["kind"] == "studio" and auto["project"]
    assert auto["freelancer"]["featured"] is False
    admin_login(client)
    assert client.put("/api/admin/featured", json={"freelancer": "nobody"}).status_code == 422
    client.put("/api/admin/featured", json={"freelancer": "lera-sokolova", "team": "orbita-team", "project": "ritm"})
    home = client.get("/api/home").json()
    assert home["freelancer"]["slug"] == "lera-sokolova" and home["freelancer"]["featured"] is True
    assert home["team"]["slug"] == "orbita-team" and home["team"]["thumbs"]
    assert home["project"]["slug"] == "ritm"


def test_admin_users_and_stats(client, user):
    client.post("/api/auth/logout")
    admin_login(client)
    users = client.get("/api/admin/users").json()
    target = next(u for u in users if u["email"] == "test@example.com")
    assert client.post(f"/api/admin/users/{target['id']}/admin", json={"is_admin": True}).json()["is_admin"] is True
    me = next(u for u in users if u["email"] == "admin@sreda.dev")
    assert client.post(f"/api/admin/users/{me['id']}/admin", json={"is_admin": False}).status_code == 400
    stats = client.get("/api/admin/stats").json()
    assert stats["specialists"] == 31 and stats["users"] >= 3  # 30 демо-анкет + анкета демо-пользователя
