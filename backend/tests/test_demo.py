def test_demo_info(client):
    info = client.get("/api/auth/demo").json()
    assert info["enabled"] is True and info["email"] and info["password"]


def test_demo_login_one_click(client):
    r = client.post("/api/auth/demo")
    assert r.status_code == 200
    assert client.get("/api/auth/me").json()["user"]["name"] == "Демо Пользователь"


def test_demo_login_with_credentials(client):
    info = client.get("/api/auth/demo").json()
    r = client.post("/api/auth/login", json={"email": info["email"], "password": info["password"]})
    assert r.status_code == 200


def test_demo_account_has_content(client):
    client.post("/api/auth/demo")
    mine = client.get("/api/projects?mine=true&limit=50").json()["items"]
    assert [p["slug"] for p in mine] == ["zerno-demo"]
    zerno = client.get("/api/projects/zerno-demo").json()
    assert zerno["is_author"] and zerno["details"]["roadmap"]
    assert client.get("/api/projects/orbita").json()["liked"] is True
    assert client.get("/api/projects/sreda-dlya-idey").json()["applied"] is True
    assert client.get("/api/specialists/anna-mironova").json()["bookmarked"] is True


def test_demo_is_idempotent(client):
    from app.db import get_db, init_db
    likes_before = client.get("/api/projects/orbita").json()["likes"]
    init_db()  # повторный старт не должен дублировать лайки и проекты
    with get_db() as db:
        assert db.execute("SELECT COUNT(*) FROM users WHERE email = 'demo@sreda.dev'").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM projects WHERE slug = 'zerno-demo'").fetchone()[0] == 1
    assert client.get("/api/projects/orbita").json()["likes"] == likes_before


def test_demo_disabled(client, monkeypatch):
    from app.features import auth
    monkeypatch.setattr(auth, "DEMO_ENABLED", False)
    assert client.get("/api/auth/demo").json() == {"enabled": False}
    assert client.post("/api/auth/demo").status_code == 404
