"""Демо-контент из content/*.json и пути к картинкам по slug.

Картинки (см. prompts/images.prompt):
  people/<slug>.webp          — аватар или логотип студии
  portfolio/<slug>-<n>.webp   — работы портфолио; первая — обложка карточки
  projects/<slug>.webp        — обложка проекта
"""
import json
from functools import lru_cache

from ..config import CONTENT_DIR


def _read(name: str):
    return json.loads((CONTENT_DIR / name).read_text(encoding="utf-8"))


@lru_cache
def taxonomy() -> dict:
    return _read("taxonomy.json")


def specialists() -> list[dict]:
    return _read("specialists.json")


def projects() -> list[dict]:
    return _read("projects.json")


def avatar_path(slug: str) -> str:
    return f"people/{slug}.webp"


def portfolio_path(slug: str, n: int) -> str:
    return f"portfolio/{slug}-{n}.webp"


def project_cover_path(slug: str) -> str:
    return f"projects/{slug}.webp"
