# Среда — платформа для совместных проектов

Люди находят друг друга, собирают команды и запускают проекты.
Бэкенд — FastAPI + SQLite. Фронтенд — HTML, CSS и JavaScript на ES-модулях, без сборщика и фреймворков.

## Запуск

```bash
python -m venv .venv
.venv\Scripts\activate                       # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

- Сайт: http://localhost:8000
- Документация API: http://localhost:8000/api/docs

База `data/sreda.db` создаётся при первом запуске и заполняется демо-контентом из `content/`. Если поменять `version` в `content/taxonomy.json`, демо-контент пересоздастся; пользователи и их проекты при этом сохранятся.

### Демо-вход

На страницах `/login` и `/register` есть кнопка «Демо-вход — без регистрации». Можно и войти вручную: `demo@sreda.dev` / `demo-sreda-2026`.

Что уже есть в демо-аккаунте:
- свой проект «Зерно» (открывается в «Мои проекты»);
- лайки, избранные специалисты и отклик на проект.

Аккаунт пересоздаётся автоматически при старте (`backend/app/db/demo.py`). На боевом сервере демо-вход выключается так: `SREDA_DEMO=0`. Логин и пароль задаются через `SREDA_DEMO_EMAIL` и `SREDA_DEMO_PASSWORD`.

Тесты:

```bash
pip install -r requirements-dev.txt
python -m pytest backend/tests
```

Архитектура — **компактное приложение по сценариям**: изменение функции начинается с одного файла в `features/`. [Устройство и правила расширения](docs/ARCHITECTURE.md).

## Структура

```
backend/
  app/
    main.py              создание приложения, подключение роутов и статики
    config.py            пути, cookie, сроки сессий (переменные окружения SREDA_*)
    features/            сценарии: auth, account, people, projects, home, search, admin
                         в каждом файле — HTTP-обработчики и их модели входных данных
    web/                 routing.py, pages.py, dependencies.py, errors.py
    core/security.py     bcrypt, токены сессий
    db/                  schema.sql, connection.py, seed.py, accounts.py, demo.py
    services/            общий код: контент, сериализация, сессии, настройки, текст
  tests/                 pytest: авторизация, каталоги, проект, страницы, статика
content/                 демо-контент в JSON: specialists (30), projects (20), taxonomy
frontend/
  pages/                 HTML-страницы: index, services, projects, project, profile, about, login, register
  assets/
    css/main.css         точка входа; base/ (токены, сетка), components/, pages/
    js/main.js           точка входа; core/ (api, сессия, иконки, заглушки), components/, pages/
    img/                 people/ · portfolio/ · projects/ · illustrations/ (генерируются по prompts/)
prompts/                 images.prompt (116 картинок), codex-images.prompt, hero-motion.prompt
tools/                   build_prompts.py (собирает images.prompt из content/), image_assets.py (учёт и сохранение картинок)
archive/hero-layers/     растровые слои hero из ChatGPT — на сайте не используются
```

## Страницы

| URL | Что там |
|---|---|
| `/` | Полноэкранный моушен-hero, бегущая строка, поиск, «Открытия недели», люди недели, цифры, «Как это работает», призыв создать проект |
| `/services` | Каталог специалистов и студий: поиск, направления, формат, город, доступность. Фильтры сохраняются в адресе страницы |
| `/projects` | Каталог проектов: категории, стадия, роль, лицензия, «ищут участников», бета-версия, «Показать ещё» |
| `/projects/{slug}` | Страница проекта: этапы, открытые роли, отклик, команда, автор, похожие проекты |
| `/people/{slug}` | Профиль: портфолио (открывается в лайтбоксе), опыт, проекты, отзывы, контакты |
| `/about` | О платформе, живые цифры, ценности |
| `/login`, `/register` | Вход и регистрация |

Кликабельно всё: карточки проектов и специалистов, участники команд, авторы, работы портфолио, результаты поиска, вакансии.

## API

- `POST /api/auth/register | login | logout`, `GET /api/auth/me`
  - пароль хешируется через bcrypt;
  - почта проверяется через email-validator;
  - сессия хранится в HttpOnly-cookie, в базе лежит только SHA-256 токена.
- `GET /api/specialists`, `/api/specialists/meta`, `/api/specialists/{slug}`; `POST .../bookmark`, `POST .../invite`
- `GET /api/projects`, `/api/projects/meta`, `/api/projects/{slug}`; `POST /api/projects`, `POST .../{slug}/apply`, `POST .../{id}/like`
- `GET /api/search?q=` — общий поиск по людям, студиям и проектам.

## Hero главной

Это векторная анимация, перенесённая один в один из композиции Claude Design («Среда — Hero Motion»). Код — в `frontend/assets/js/pages/hero-motion.js`. Последовательность:

1. Орбиты прорисовываются и переливаются.
2. Дуга собирается из двух половин.
3. Сверху падает шар, дважды отскакивает, по поверхности расходятся волны.
4. По нейронам бегут искры.
5. Появляются участники проекта «Пульс» с подписями ролей.

После этого крутится 6-секундный «живой» цикл.

- Время анимации идёт по реальным часам: при редких кадрах она не тормозит.
- Когда hero уходит с экрана или вкладка скрыта, анимация встаёт на паузу.
- Клик по сцене проигрывает её заново.
- Параметр `?hero-t=8` открывает страницу сразу на нужной секунде.
- Настройка `prefers-reduced-motion` учитывается.

## Адаптив и анимации

- Сетка широкая, до 1920px. Карточки раскладываются автоматически: от 1 колонки на телефоне до 5–6 на больших экранах.
- Все размеры заданы в `rem`, корневой шрифт растёт на 2K, 3K, 4K и 5K (`base/tokens.css`), поэтому на больших мониторах интерфейс не мельчит.
- Анимации:
  - появление при прокрутке, заголовки «по словам», счётчики;
  - параллакс иллюстраций за курсором;
  - ховеры карточек, блик на кнопках, бегущая строка;
  - плавные переходы между страницами (View Transitions).

## Изображения

Список всех картинок — в `prompts/images.prompt`. Пока файла нет, сайт показывает векторную заглушку (`core/placeholders.js`), поэтому картинки можно добавлять постепенно.

```bash
python -m tools.build_prompts          # пересобрать промпты после правок content/
python -m tools.image_assets status    # сколько картинок готово
```

## Ещё не сделано

- вход через Google (нужны OAuth-ключи);
- восстановление пароля;
- платежи и донаты.
