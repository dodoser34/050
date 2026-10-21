"""Среда — FastAPI-приложение: API + раздача фронтенда.

Запуск из корня проекта:  uvicorn app.main:app --app-dir backend --reload
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .web.errors import register_error_handlers
from .web.routing import routers
from . import config
from .config import ASSETS_DIR
from .db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


async def cache_headers(request: Request, call_next):
    """HTML/CSS/JS — всегда сверять с сервером (ETag → 304), чтобы после обновления не висела старая версия;
    картинки — кэшировать на час."""
    response = await call_next(request)
    if "cache-control" not in response.headers:
        path = request.url.path
        if response.status_code >= 400:
            # ошибки не кэшируем: иначе браузер час «помнит», что картинки нет, даже когда её уже загрузили
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith(("/assets/img/", "/uploads/")):
            response.headers["Cache-Control"] = "public, max-age=3600"
        elif not path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache"
        else:
            response.headers["Cache-Control"] = "no-store"
    return response


def create_app() -> FastAPI:
    app = FastAPI(title="Среда", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
    app.middleware("http")(cache_headers)
    register_error_handlers(app)
    for router in routers:
        app.include_router(router)
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
    config.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=config.UPLOADS_DIR), name="uploads")
    return app


app = create_app()
