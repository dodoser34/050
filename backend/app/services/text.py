"""Работа с текстом: адреса (slug) латиницей."""
import re
import time

_TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                     ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                      "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def slugify(text: str) -> str:
    """«Город будущего» → «gorod-buduschego»."""
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in text.lower())
    return re.sub(r"[^a-z0-9]+", "-", latin).strip("-")[:60] or "item"


def unique_slug(text: str) -> str:
    """Slug с коротким суффиксом, чтобы не пересекаться с существующими."""
    return f"{slugify(text)}-{int(time.time() * 1000) % 100_000}"
