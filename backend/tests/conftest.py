import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """Приложение на временной базе — каждый тест начинает с чистого демо-контента."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("SREDA_DB_PATH", str(db_path))
    from app import config
    from app.db import connection
    monkeypatch.setattr(config, "DB_PATH", db_path)
    monkeypatch.setattr(connection, "DB_PATH", db_path)

    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def user(client):
    r = client.post("/api/auth/register", json={
        "name": "Тест Тестов", "email": "test@example.com", "password": "password123", "accept_terms": True})
    assert r.status_code == 201
    return r.json()


os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
