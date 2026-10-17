-- Схема базы «Среды» (SQLite)

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Настройки сайта, которые меняет администратор (например, кого показывать на главной)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS specialists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    kind       TEXT NOT NULL,              -- person | studio
    name       TEXT NOT NULL,
    role       TEXT NOT NULL,
    avatar     TEXT NOT NULL,
    cover      TEXT NOT NULL,
    city       TEXT NOT NULL,
    formats    TEXT NOT NULL,              -- JSON
    directions TEXT NOT NULL,              -- JSON
    tags       TEXT NOT NULL,              -- JSON
    about      TEXT NOT NULL,
    verified   INTEGER NOT NULL DEFAULT 0,
    open       INTEGER NOT NULL DEFAULT 1,
    popularity INTEGER NOT NULL DEFAULT 0,
    details    TEXT NOT NULL DEFAULT '{}', -- JSON: био, навыки, портфолио, опыт, отзывы
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- владелец анкеты (NULL — демо-контент)
    status     TEXT NOT NULL DEFAULT 'approved',                 -- pending | approved | rejected
    moderation_note TEXT NOT NULL DEFAULT ''                     -- причина отклонения
);

CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL,
    tags        TEXT NOT NULL,             -- JSON
    stage       TEXT NOT NULL,
    roles       TEXT NOT NULL,             -- JSON: открытые роли
    license     TEXT NOT NULL,
    beta        INTEGER NOT NULL DEFAULT 0,
    cover       TEXT NOT NULL,
    owner_slug  TEXT,
    owner_name  TEXT NOT NULL,
    owner_logo  TEXT NOT NULL,
    team        TEXT NOT NULL,             -- JSON: [{slug, name, role, avatar}]
    details     TEXT NOT NULL DEFAULT '{}', -- JSON: о проекте, проблема/решение, цели, дорожная карта, роли, обновления
    likes       INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'approved',  -- pending | approved | rejected
    moderation_note TEXT NOT NULL DEFAULT '',
    author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    specialist_id INTEGER NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, specialist_id)
);

CREATE TABLE IF NOT EXISTS applications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invitations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    specialist_id INTEGER NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
    message       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
