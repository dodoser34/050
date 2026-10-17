"""Подключение сценариев платформы в одном месте."""
from ..features import account, admin, auth, home, people, projects, search
from . import pages

routers = (
    auth.router, account.router, home.router, people.router,
    projects.router, search.router, admin.router, pages.router,
)
