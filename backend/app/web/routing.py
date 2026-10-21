"""Подключение сценариев платформы в одном месте."""
from ..features import (account, admin, auth, home, messages, notifications, people, posts, projects, reports,
                        search)
from . import pages

routers = (
    auth.router, account.router, home.router, people.router, projects.router, projects.applications_router,
    messages.router, notifications.router, posts.router, reports.router, search.router, admin.router, pages.router,
)
