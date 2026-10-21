"""Сохранение картинок, присланных из браузера как data URL (сжатие делает сам браузер)."""
import base64
import binascii
import re
import uuid

from fastapi import HTTPException

from .. import config

_DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$")
_EXT = {"png": "png", "jpeg": "jpg", "webp": "webp"}
_MAGIC = {"png": b"\x89PNG", "jpeg": b"\xff\xd8", "webp": b"RIFF"}


def save_image(data_url: str, field: str = "image") -> str:
    """Проверяет data URL и сохраняет файл. Возвращает публичный путь /uploads/…"""
    m = _DATA_URL.match(data_url or "")
    if not m:
        raise HTTPException(status_code=422, detail="Поддерживаются изображения PNG, JPEG и WebP")
    kind, payload = m.groups()
    try:
        raw = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Не удалось прочитать изображение") from None
    if len(raw) > config.UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Изображение больше 4 МБ — выберите файл поменьше")
    if not raw.startswith(_MAGIC[kind]):
        raise HTTPException(status_code=422, detail="Файл не похож на изображение")
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{field}-{uuid.uuid4().hex}.{_EXT[kind]}"
    (config.UPLOADS_DIR / name).write_bytes(raw)
    return config.UPLOADS_URL + name


def remove_upload(path: str | None) -> None:
    """Удаляет ранее загруженный файл (демо-картинки из assets не трогает)."""
    if path and path.startswith(config.UPLOADS_URL):
        target = config.UPLOADS_DIR / path[len(config.UPLOADS_URL):]
        if target.parent == config.UPLOADS_DIR and target.exists():
            target.unlink()
