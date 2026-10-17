def test_register_validation_errors_are_per_field(client):
    r = client.post("/api/auth/register", json={"name": "a", "email": "bad", "password": "123", "accept_terms": False})
    assert r.status_code == 422
    assert set(r.json()["errors"]) == {"name", "email", "password", "accept_terms"}


def test_register_sets_session(client, user):
    me = client.get("/api/auth/me").json()["user"]
    assert me["email"] == "test@example.com"


def test_duplicate_email_rejected(client, user):
    r = client.post("/api/auth/register", json={
        "name": "Другой", "email": "TEST@example.com", "password": "password123", "accept_terms": True})
    assert r.status_code == 409


def test_login_logout(client, user):
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["user"] is None
    assert client.post("/api/auth/login", json={"email": "test@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "test@example.com", "password": "password123"}).status_code == 200
    assert client.get("/api/auth/me").json()["user"]["name"] == "Тест Тестов"
