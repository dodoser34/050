"""Пути и настройки приложения."""
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]

CONTENT_DIR = ROOT_DIR / "content"
FRONTEND_DIR = ROOT_DIR / "frontend"
PAGES_DIR = FRONTEND_DIR / "pages"
ASSETS_DIR = FRONTEND_DIR / "assets"
DB_PATH = Path(os.environ.get("SREDA_DB_PATH", ROOT_DIR / "data" / "sreda.db"))

# Картинки лежат в frontend/assets/img и отдаются по этому префиксу
IMG_URL = "/assets/img/"

SESSION_COOKIE = "sreda_session"
SESSION_TTL_SHORT = 60 * 60 * 24          # 1 день
SESSION_TTL_LONG = 60 * 60 * 24 * 30      # 30 дней («Запомнить меня»)
COOKIE_SECURE = os.environ.get("SREDA_COOKIE_SECURE", "0") == "1"

# Администратор создаётся при старте. На боевом сервере обязательно задать свои значения!
ADMIN_NAME = "Администратор"
ADMIN_EMAIL = os.environ.get("SREDA_ADMIN_EMAIL", "admin@sreda.dev")
ADMIN_PASSWORD = os.environ.get("SREDA_ADMIN_PASSWORD", "admin-sreda-2026")

# Демо-вход: готовый аккаунт для показа сайта. На боевом сервере выключить: SREDA_DEMO=0
DEMO_ENABLED = os.environ.get("SREDA_DEMO", "1") != "0"
DEMO_NAME = "Демо Пользователь"
DEMO_EMAIL = os.environ.get("SREDA_DEMO_EMAIL", "demo@sreda.dev")
DEMO_PASSWORD = os.environ.get("SREDA_DEMO_PASSWORD", "demo-sreda-2026")
