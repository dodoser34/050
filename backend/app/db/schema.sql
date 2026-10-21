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
    account_type  TEXT NOT NULL DEFAULT 'person',  -- person | org
    last_seen     INTEGER NOT NULL DEFAULT 0,       -- unix-время последней активности (статус «в сети»)
    settings      TEXT NOT NULL DEFAULT '{}',       -- JSON: приватность
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
    closed      INTEGER NOT NULL DEFAULT 0,        -- проект завершён / закрыт
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
    status     TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
    conversation_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invitations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    specialist_id INTEGER NOT NULL REFERENCES specialists(id) ON DELETE CASCADE,
    message       TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Переписка: диалог двух сторон. Сторона B — владелец анкеты (user_b) или демо-анкета без владельца (только peer_slug).
CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- кто начал диалог
    user_b     INTEGER REFERENCES users(id) ON DELETE CASCADE,            -- собеседник (NULL — демо-анкета)
    peer_slug  TEXT,                                                       -- анкета собеседника
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,        -- диалог по отклику на проект
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,      -- NULL — ответ демо-анкеты
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, id);

-- До какого сообщения пользователь прочитал диалог
CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,              -- application | application_status | invite | moderation | report | member | post
    text       TEXT NOT NULL,
    url        TEXT NOT NULL DEFAULT '',
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications (user_id, id);

-- Блоги пользователей и организаций, лента проекта: посты, результаты и опросы
CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type  TEXT NOT NULL,             -- profile | project
    owner_slug  TEXT NOT NULL,
    author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_slug TEXT,                      -- анкета автора, если есть
    kind        TEXT NOT NULL DEFAULT 'post',  -- post | result | poll
    title       TEXT NOT NULL DEFAULT '',
    body        TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',
    poll        TEXT NOT NULL DEFAULT '[]',    -- JSON: варианты ответа
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS posts_by_owner ON posts (owner_type, owner_slug, id);

CREATE TABLE IF NOT EXISTS poll_votes (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option  INTEGER NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

-- Жалобы на анкеты, организации, проекты и посты
CREATE TABLE IF NOT EXISTS reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_type  TEXT NOT NULL,            -- profile | project | post
    target_slug  TEXT NOT NULL,
    target_title TEXT NOT NULL DEFAULT '',
    reason       TEXT NOT NULL,
    comment      TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
    resolution   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
