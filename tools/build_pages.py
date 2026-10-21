"""Export the public demo to GitHub Pages without publishing the local database.

Run: python -m tools.build_pages --base-path /050/
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pages"


def public_data():
    # Always seed a disposable database. Never read accounts or user content
    # from data/sreda.db, even when this command runs on a developer's machine.
    with tempfile.TemporaryDirectory(prefix="sreda-pages-") as temp:
        os.environ["SREDA_DB_PATH"] = str(Path(temp) / "demo.db")
        os.environ["SREDA_DEMO"] = "0"
        sys.path.insert(0, str(ROOT / "backend"))
        from app.db import init_db
        from app.features import home, people, projects

        init_db()
        specialists = people.list_specialists(user=None, direction=[], format=[])
        catalog = projects.list_projects(user=None, offset=0, limit=50)
        return {
            "specialists": specialists,
            "projects": catalog,
            "specialistsMeta": people.specialists_meta(),
            "projectsMeta": projects.projects_meta(),
            "home": home.home(user=None),
            "profiles": {s["slug"]: people.get_specialist(s["slug"], user=None)
                         for s in specialists["items"]},
            "projectDetails": {p["slug"]: projects.get_project(p["slug"], user=None)
                               for p in catalog["items"]},
        }


def build(base_path):
    base = "/" + base_path.strip("/") + "/" if base_path.strip("/") else "/"
    if not re.fullmatch(r"/[A-Za-z0-9_./-]*/?", base) or ".." in base:
        raise ValueError("Use a URL path such as /050/ or /")

    def rewrite(text):
        # Root-relative links appear both in HTML and in JS template strings.
        text = re.sub(
            r'''(["'`])/(?=(?:assets|api|services|projects|people|about|login|register|me|admin|messages)(?:[/\n?\#"'`]|$))''',
            lambda m: m[1] + base, text)
        text = text.replace('href="/"', 'href="' + base + '"')
        return re.sub(r"url\(/(?!/)", lambda _: "url(" + base, text)

    data = public_data()
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(ROOT / "frontend" / "assets", OUTPUT / "assets")
    for path in (OUTPUT / "assets").rglob("*"):
        if path.suffix in {".js", ".css", ".svg"}:
            path.write_text(rewrite(path.read_text(encoding="utf-8")), encoding="utf-8")

    def page(route, name):
        target = OUTPUT / route / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rewrite((ROOT / "frontend" / "pages" / name).read_text(encoding="utf-8")), encoding="utf-8")

    for route, name in {"": "index.html", "services": "services.html", "projects": "projects.html",
                        "about": "about.html", "login": "login.html", "register": "register.html",
                        "me": "me.html", "admin": "admin.html", "messages": "messages.html",
                        "projects/view": "project.html", "people/view": "profile.html"}.items():
        page(route, name)
    for slug in data["profiles"]:
        page("people/" + slug, "profile.html")
    for slug in data["projectDetails"]:
        page("projects/" + slug, "project.html")

    core = OUTPUT / "assets" / "js" / "core"
    (core / "pages-data.json").write_text(rewrite(json.dumps(data, ensure_ascii=False)), encoding="utf-8")
    adapter = (ROOT / "tools" / "pages_api.js").read_text(encoding="utf-8")
    (core / "api.js").write_text(adapter.replace("__BASE_PATH__", json.dumps(base)), encoding="utf-8")
    store = (ROOT / "tools/pages_store.js").read_text(encoding="utf-8")
    (core / "pages-store.js").write_text(store.replace("__BASE_PATH__", json.dumps(base)), encoding="utf-8")
    social = (ROOT / "tools/pages_social.js").read_text(encoding="utf-8")
    (core / "pages-social.js").write_text(social, encoding="utf-8")

    # Browser-created entities use existing HTML shells with a query parameter:
    # GitHub Pages cannot create a directory for each new local slug.
    cards = OUTPUT / "assets/js/components/cards.js"
    text = cards.read_text(encoding="utf-8")
    text = text.replace('projects/${encodeURIComponent(p.slug)}', 'projects/view/?slug=${encodeURIComponent(p.slug)}')
    text = text.replace('people/${encodeURIComponent(slug)}', 'people/view/?slug=${encodeURIComponent(slug)}')
    cards.write_text(text, encoding="utf-8")
    dom = core / "dom.js"
    text = dom.read_text(encoding="utf-8").replace(
        'export const slugFromPath = () => ',
        'export const slugFromPath = () => new URLSearchParams(location.search).get("slug") || ')
    dom.write_text(text, encoding="utf-8")
    session = core / "session.js"
    text = session.read_text(encoding="utf-8").replace('fallback = "/"', 'fallback = ' + json.dumps(base))
    text = text.replace('["/login", "/register"]', json.dumps([base + "login", base + "register"]))
    session.write_text(text, encoding="utf-8")
    (OUTPUT / ".nojekyll").touch()
    (OUTPUT / "404.html").write_text(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Страница не найдена — Среда</title>'
        '<h1>Страница не найдена</h1><p><a href="' + base + '">Вернуться на главную</a></p></html>', encoding="utf-8")
    print(f"Exported {len(data['profiles'])} profiles and {len(data['projectDetails'])} projects to {OUTPUT} (base {base})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-path", default="/", help="GitHub project URL prefix, e.g. /050/")
    build(parser.parse_args().base_path)
