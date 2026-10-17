"""HTML-страницы сайта (frontend/pages)."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..config import PAGES_DIR

router = APIRouter(include_in_schema=False)

PAGES = {
    "/": "index.html",
    "/login": "login.html",
    "/register": "register.html",
    "/services": "services.html",
    "/projects": "projects.html",
    "/about": "about.html",
    "/me": "me.html",
    "/admin": "admin.html",
}


def _page(name: str):
    def handler() -> FileResponse:
        return FileResponse(PAGES_DIR / name)
    return handler


for _path, _file in PAGES.items():
    router.add_api_route(_path, _page(_file), methods=["GET"])


@router.get("/projects/{slug}")
def project_page(slug: str) -> FileResponse:
    return FileResponse(PAGES_DIR / "project.html")


@router.get("/people/{slug}")
def profile_page(slug: str) -> FileResponse:
    return FileResponse(PAGES_DIR / "profile.html")
