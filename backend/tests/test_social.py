"""Сообщения, отклики, уведомления, ленты и блоги, жалобы, приватность, управление проектами."""
import base64

PNG = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                  "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()

PROFILE = {
    "kind": "person", "name": "Тест Специалист", "role": "Моушн-дизайнер", "city": "Алматы",
    "formats": ["Удалённо"], "directions": ["3D и моушн", "нейросети для видео"], "tags": [],
    "bio": "Делаю анимацию для интерфейсов и рекламы. Люблю аккуратные переходы.", "skills": [],
    "portfolio": [{"type": "image", "title": "Шоурил", "image_data": PNG},
                  {"type": "video", "title": "Ролик", "video_url": "https://www.youtube.com/watch?v=abc"}],
}


def login(client, email, password="password123"):
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": email, "password": password}).status_code == 200


def register(client, email, name="Второй Пользователь", **extra):
    client.post("/api/auth/logout")
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123", "accept_terms": True, **extra})
    assert r.status_code == 201, r.json()
    return r.json()


def admin(client):
    client.post("/api/auth/logout")
    client.post("/api/auth/demo", json={"role": "admin"})


def approve_profile(client, email):
    slug = client.get("/api/me/profile").json()["profile"]["slug"]
    admin(client)
    client.post(f"/api/admin/specialists/{slug}/moderate", json={"action": "approve"})
    login(client, email)
    return slug


def test_org_registration_creates_draft_profile(client):
    r = register(client, "org@example.com", account_type="org", org_name="Студия Свет", org_city="Шымкент")
    assert r["account_type"] == "org"
    me = client.get("/api/me/profile").json()
    assert me["account_type"] == "org" and me["profile"]["kind"] == "studio" and me["profile"]["status"] == "pending"
    client.post("/api/auth/logout")
    bad = client.post("/api/auth/register", json={"name": "Иван", "email": "x@example.com", "password": "password123",
                                                  "accept_terms": True, "account_type": "org"})
    assert bad.status_code == 422 and "org_name" in bad.json()["errors"]


def test_profile_custom_directions_and_portfolio_types(client, user):
    saved = client.put("/api/me/profile", json=PROFILE).json()["profile"]
    assert "Нейросети для видео" in saved["directions"]
    works = saved["details"]["portfolio"]
    assert works[0]["cover"].startswith("/uploads/") and works[1]["video_url"].startswith("https://")
    assert client.get(works[0]["cover"]).status_code == 200
    bad = client.put("/api/me/profile", json={**PROFILE, "portfolio": [{"type": "video", "title": "Ролик", "video_url": "https://example.com/v"}]})
    assert bad.status_code == 422


def test_project_create_edit_close_delete(client, user):
    p = client.post("/api/projects", json={"title": "Свой проект", "description": "Описание своего проекта",
                                           "category": "уличное искусство", "stage": "Идея",
                                           "roles": ["дизайнер", " Дизайнер ", "motion-дизайнер"], "cover_data": PNG}).json()
    assert p["roles"] == ["Дизайнер", "Motion-дизайнер"] and p["category"] == "Уличное искусство"
    assert p["cover"].startswith("/uploads/")
    slug = p["slug"]
    body = {"title": "Свой проект 2", "description": "Новое описание проекта", "category": "Искусство", "stage": "Бета",
            "roles": [], "closed": True, "team_visibility": "hidden", "show_team_count": False, "remove_cover": True}
    upd = client.put(f"/api/projects/{slug}", json=body).json()
    assert upd["title"] == "Свой проект 2" and upd["closed"] is True and upd["cover"] is None and upd["can_manage"] is True
    register(client, "other@example.com")
    assert client.put(f"/api/projects/{slug}", json=body).status_code == 403
    assert client.delete(f"/api/projects/{slug}").status_code == 403
    login(client, "test@example.com")
    assert client.delete(f"/api/projects/{slug}").json()["ok"] is True
    assert client.get(f"/api/projects/{slug}").status_code == 404


def test_apply_conversation_decision_and_notifications(client, user):
    # автор: демо-пользователь с проектом «Зерно»
    client.put("/api/me/profile", json=PROFILE)
    approve_profile(client, "test@example.com")
    r = client.post("/api/projects/zerno-demo/apply", json={"role": "Бренд-дизайнер", "message": "Хочу сделать айдентику"}).json()
    conv = r["conversation_id"]
    mine = client.get("/api/me/applications").json()["items"]
    assert mine[0]["project"]["slug"] == "zerno-demo" and mine[0]["status"] == "pending"

    client.post("/api/auth/logout")
    client.post("/api/auth/demo")
    summary = client.get("/api/me/summary").json()
    assert summary["unread_notifications"] >= 1 and summary["unread_messages"] >= 1
    apps = client.get("/api/projects/zerno-demo/applications").json()["items"]
    target = next(a for a in apps if a["status"] == "pending")
    thread = client.get(f"/api/conversations/{conv}").json()
    assert thread["application"]["can_decide"] is True and "айдентику" in thread["messages"][-1]["body"]
    client.post(f"/api/applications/{target['id']}/decision", json={"status": "accepted"})
    project = client.get("/api/projects/zerno-demo").json()
    assert any(m["name"] == "Тест Специалист" for m in project["team"]) and "Бренд-дизайнер" not in project["roles"]

    login(client, "test@example.com")
    assert client.get("/api/me/applications").json()["items"][0]["status"] == "accepted"
    notes = client.get("/api/notifications").json()
    assert notes["unread"] >= 1 and any(n["kind"] == "application_status" for n in notes["items"])
    client.post("/api/notifications/read", json={})
    assert client.get("/api/me/summary").json()["unread_notifications"] == 0


def test_messages_with_demo_profile(client, user):
    conv = client.post("/api/conversations", json={"to_slug": "anna-mironova", "message": "Здравствуйте!"}).json()["id"]
    thread = client.get(f"/api/conversations/{conv}").json()
    assert [m["mine"] for m in thread["messages"]] == [True, False] and thread["peer"]["name"] == "Анна Миронова"
    client.post(f"/api/conversations/{conv}/messages", json={"body": "Ещё вопрос"})
    assert len(client.get(f"/api/conversations/{conv}?after={thread['messages'][-1]['id']}").json()["messages"]) == 2
    assert client.get("/api/conversations").json()["items"][0]["peer"]["slug"] == "anna-mironova"
    register(client, "spy@example.com")
    assert client.get(f"/api/conversations/{conv}").status_code == 404


def test_project_feed_permissions_and_poll(client, user):
    assert client.get("/api/posts?owner_type=project&owner_slug=zerno-demo").json()["can_post"] is False
    assert client.post("/api/posts", json={"owner_type": "project", "owner_slug": "zerno-demo", "body": "Привет"}).status_code == 403
    client.post("/api/auth/logout")
    client.post("/api/auth/demo")
    feed = client.get("/api/posts?owner_type=project&owner_slug=zerno-demo").json()
    assert feed["can_post"] is True
    poll = next(p for p in feed["items"] if p["kind"] == "poll")
    voted = client.post(f"/api/posts/{poll['id']}/vote", json={"option": 1}).json()
    assert voted["poll"]["my_vote"] == 1 and voted["poll"]["total"] == 1
    new = client.post("/api/posts", json={"owner_type": "project", "owner_slug": "zerno-demo", "kind": "result",
                                          "title": "Итог недели", "body": "Сделали меню", "image_data": PNG}).json()
    assert new["image"].startswith("/uploads/")
    assert client.delete(f"/api/posts/{new['id']}").json()["ok"] is True
    # лента только для участников
    upd = client.get("/api/projects/zerno-demo").json()
    client.put("/api/projects/zerno-demo", json={"title": upd["title"], "description": upd["description"], "category": upd["category"],
                                                 "stage": upd["stage"], "roles": upd["roles"], "blog_visibility": "members"})
    login(client, "test@example.com")
    assert client.get("/api/posts?owner_type=project&owner_slug=zerno-demo").json()["hidden"] is True


def test_profile_blog_only_owner_posts(client, user):
    assert client.post("/api/posts", json={"owner_type": "profile", "owner_slug": "anna-mironova", "body": "Чужой блог"}).status_code == 403
    client.put("/api/me/profile", json=PROFILE)
    slug = approve_profile(client, "test@example.com")
    assert client.post("/api/posts", json={"owner_type": "profile", "owner_slug": slug, "body": "Мой первый пост"}).status_code == 201
    assert client.get(f"/api/posts?owner_type=profile&owner_slug={slug}").json()["items"][0]["body"] == "Мой первый пост"


def test_org_staff_privacy(client, user):
    register(client, "org@example.com", account_type="org", org_name="Студия Свет")
    client.put("/api/me/profile", json={**PROFILE, "kind": "studio", "name": "Студия Свет", "portfolio": []})
    org = approve_profile(client, "org@example.com")
    client.put("/api/me/org", json={"staff": [{"slug": "anna-mironova", "role": "Арт-директор", "can_post": True, "visible": False},
                                              {"slug": "mark-volkov", "role": "Разработчик"}], "staff_visibility": "selected",
                                    "show_staff_count": True})
    client.post("/api/auth/logout")
    details = client.get(f"/api/specialists/{org}").json()["details"]
    assert [m["slug"] for m in details["staff"]] == ["mark-volkov"] and details["staff_count"] == 2
    assert all(o["slug"] != org for o in client.get("/api/specialists/anna-mironova").json()["details"]["organizations"])


def test_reports_flow(client, user):
    assert client.post("/api/reports", json={"target_type": "project", "target_slug": "orbita", "reason": "other"}).status_code == 422
    assert client.post("/api/reports", json={"target_type": "project", "target_slug": "orbita", "reason": "plagiarism",
                                             "comment": "Обложка взята из чужого портфолио"}).status_code == 201
    assert client.post("/api/reports", json={"target_type": "project", "target_slug": "orbita", "reason": "spam"}).status_code == 409
    admin(client)
    report = client.get("/api/admin/reports").json()[0]
    assert report["target_title"] and report["url"] == "/projects/orbita"
    assert client.get("/api/admin/stats").json()["reports"] == 1
    client.post(f"/api/admin/reports/{report['id']}", json={"status": "resolved", "note": "Обложку заменили"})
    login(client, "test@example.com")
    assert any(n["kind"] == "report" for n in client.get("/api/notifications").json()["items"])


def test_presence_privacy_and_hidden_projects(client, user):
    client.post("/api/auth/logout")
    client.post("/api/auth/demo")
    me = client.get("/api/specialists/demo-polzovatel").json()
    assert me["presence"]["online"] is True and any(p["founder"] for p in me["details"]["participation"])
    client.put("/api/me/settings", json={"show_online": "nobody", "hidden_projects": ["zerno-demo"]})
    login(client, "test@example.com")
    other = client.get("/api/specialists/demo-polzovatel").json()
    assert other["presence"] is None and all(p["slug"] != "zerno-demo" for p in other["details"]["participation"])
    assert client.get("/api/specialists/anna-mironova").json()["presence"] is not None   # демо-анкета


def test_moderation_sends_notification(client, user):
    p = client.post("/api/projects", json={"title": "На проверку", "description": "Описание для модерации",
                                           "category": "Игры", "stage": "Идея"}).json()
    admin(client)
    client.post(f"/api/admin/projects/{p['slug']}/moderate", json={"action": "reject", "note": "Добавьте описание"})
    login(client, "test@example.com")
    assert "Добавьте описание" in client.get("/api/notifications").json()["items"][0]["text"]
