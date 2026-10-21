/** Local demo state. Never connects to the production API or exports real accounts. */
const BASE = __BASE_PATH__;
const KEY = `sreda:pages:v1:${BASE}`, SESSION = `${KEY}:session`;
export const DEMO_PASSWORD = "demo-sreda-2026";
export const copy = (value) => structuredClone(value);
export class ApiError extends Error {
  constructor(status, data) { super(data?.detail || "Ошибка запроса"); this.status = status; this.errors = data?.errors || {}; }
}
export const fail = (status, detail, errors = {}) => { throw new ApiError(status, { detail, errors }); };
export const publicUser = ({ id, name, email, is_admin, account_type }) => ({ id, name, email, is_admin, account_type: account_type || "person" });
export const validate = (errors) => { if (Object.keys(errors).length) fail(422, "Проверьте поля формы", errors); };
export const textErrors = (body, rules) => Object.fromEntries(Object.entries(rules).filter(([key, [min, max]]) =>
  typeof body[key] !== "string" || body[key].trim().length < min || body[key].length > max)
  .map(([key, [min, max]]) => [key, `От ${min} до ${max} символов`]));
export const now = () => new Date().toISOString();
/** Ссылка внутри демо: страницы, созданные в браузере, открываются через ?slug= */
export const pageUrl = (kind, slug, hash = "") => `${BASE}${kind}/view/?slug=${encodeURIComponent(slug)}${hash}`;
export const appUrl = (path) => BASE + path.replace(/^\//, "");

const LISTS = ["users", "projects", "profiles", "likes", "bookmarks", "applications", "invitations",
  "conversations", "messages", "notifications", "posts", "votes", "reports"];

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { fail(503, "Не удалось сохранить демо. Разрешите хранение данных сайта и проверьте свободное место. Если загружали картинки — удалите часть из них"); }
}
export const nextId = (state) => (state.seq = (state.seq || 5000) + 1);

export function readState(data) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if ([1, 2].includes(state.version) && ["users", "projects", "profiles", "likes", "bookmarks", "applications", "invitations"].every((k) => Array.isArray(state[k]))) {
        if (state.version === 1) { migrate(state, data); save(state); }
        return state;
      }
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) fail(503, "Разрешите сохранение данных сайта в браузере для демо");
  }
  const project = copy(data.projectDetails[data.projects.items[0].slug]);
  const profile = copy(data.profiles[data.specialists.items.find((s) => s.kind === "person").slug]);
  const team = ["mila-osipova", "yana-kuznetsova"].map((slug, i) => data.profiles[slug] && ({ slug, name: data.profiles[slug].name,
    role: data.profiles[slug].role, avatar: data.profiles[slug].avatar, verified: data.profiles[slug].verified, kind: "person",
    can_post: i === 0, visible: true })).filter(Boolean);
  const own = { ...project, author_id: 1, owner_slug: "demo-member", owner_name: "Алексей Демо", owner_logo: null, owner_verified: false,
    owner_kind: "person", team: [], team_count: 0, likes: 0, details: {}, closed: false, created_at: now() };
  const state = { version: 2, seq: 5000,
    users: [
      { id: 1, name: "Алексей Демо", email: "demo@sreda.dev", is_admin: false, account_type: "person", created_at: now(), demo: true },
      { id: 2, name: "Администратор", email: "admin@sreda.dev", is_admin: true, account_type: "person", created_at: now(), demo: true },
    ],
    projects: [{ ...own, id: 1001, slug: "demo-zerno", title: "Зерно", status: "approved", team, team_count: team.length,
      description: "Кофейня-коворкинг для творческих людей: днём — рабочие места, вечером — показы и встречи.",
      category: "Дизайн", tags: ["Дизайн"], stage: "Идея", roles: ["Бренд-дизайнер", "SMM-менеджер", "Бариста"],
      details: { about: ["«Зерно» — кофейня-коворкинг на первом этаже старого дома: днём здесь работают фрилансеры и маленькие команды, вечером проходят показы портфолио, лекции и встречи проектов из Среды."] } },
    { ...own, id: 1002, slug: "demo-workshop", title: "Творческая мастерская", status: "pending" }],
    profiles: [{ ...profile, id: 1001, slug: "demo-member", user_id: 1, name: "Алексей Демо", role: "Продюсер проектов",
      verified: false, popularity: 0, status: "approved", moderation_note: "",
      details: { ...profile.details, bio: "Собираю команды под городские и творческие проекты. Сейчас запускаю кофейню-коворкинг «Зерно».",
        portfolio: [], reviews: [], participation: [], experience: [{ place: "Зерно", role: "Основатель", period: "2026" }] } }],
    likes: [], bookmarks: [], applications: [], invitations: [], featured: {} };
  migrate(state, data);
  save(state);
  return state;
}

/** Версия 2: переписка, уведомления, ленты, жалобы. Добавляем пустые списки и стартовое демо-содержимое. */
function migrate(state, data) {
  LISTS.forEach((k) => { state[k] ??= []; });
  state.version = 2;
  state.seq ??= 5000;
  state.reads ??= {};
  const t = (min) => new Date(Date.now() - min * 60000).toISOString();
  const conv = (fields) => { const c = { id: nextId(state), created_at: t(90), updated_at: t(5), project_id: null, user_b: null, ...fields }; state.conversations.push(c); return c; };
  const msg = (c, sender_id, body, min) => state.messages.push({ id: nextId(state), conversation_id: c.id, sender_id, body, created_at: t(min) });
  if (data.profiles["mila-osipova"]) {
    const c = conv({ user_a: 1, peer_slug: "mila-osipova" });
    msg(c, 1, "Мила, привет! Посмотрите, пожалуйста, мудборд вывески — ссылка в проекте.", 40);
    msg(c, null, "Привет! Посмотрела — нравится второй вариант, с тёплым светом. Набросаю эскизы к пятнице.", 5);
  }
  const target = data.projects.items.find((p) => p.roles.length) || data.projects.items[0];
  if (target && !state.applications.some((a) => a.user_id === 1)) {
    const c = conv({ user_a: 1, peer_slug: target.owner_slug, project_id: target.id });
    msg(c, 1, `Отклик на роль «${target.roles[0] || "любая"}»\n\nХочу помочь с проектом — есть опыт в похожих задачах.`, 120);
    msg(c, null, "Спасибо за отклик! Посмотрели ваш профиль — давайте попробуем. (Это демо-анкета: ответ пришёл автоматически.)", 60);
    state.applications.push({ id: nextId(state), user_id: 1, project_id: target.id, role: target.roles[0] || "", status: "accepted",
      message: "Хочу помочь с проектом — есть опыт в похожих задачах.", conversation_id: c.id, created_at: t(120) });
    state.notifications.push({ id: nextId(state), user_id: 1, kind: "application_status", read: false, created_at: t(60),
      text: `Отклик на проект «${target.title}» принят — добро пожаловать в команду!`, url: appUrl(`messages?c=${c.id}`) });
  }
  state.notifications.push({ id: nextId(state), user_id: 1, kind: "member", read: false, created_at: t(30),
    text: "Мила Осипова присоединилась к команде проекта «Зерно»", url: pageUrl("projects", "demo-zerno") });
  const post = (owner_type, owner_slug, author_id, author_name, author_slug, kind, title, body, poll = [], min = 30) =>
    state.posts.push({ id: nextId(state), owner_type, owner_slug, author_id, author_name, author_slug, kind, title, body, image: "", poll, created_at: t(min) });
  post("project", "demo-zerno", 1, "Алексей Демо", "demo-member", "result", "Готов первый вариант вывески",
    "Мила собрала три варианта вывески. Выбрали тёплую подсветку и шрифт без засечек — дальше меню и стаканы.", [], 300);
  post("project", "demo-zerno", 1, "Алексей Демо", "demo-member", "poll", "Какой напиток сделать фирменным?", "",
    ["Раф с лавандой", "Апельсиновый эспрессо-тоник", "Какао с кардамоном"], 200);
  post("profile", "demo-member", 1, "Алексей Демо", "demo-member", "post", "Почему кофейня-коворкинг",
    "Полгода искал место, где можно спокойно поработать и встретиться с командой. Не нашёл — решил сделать сам.", [], 900);
  const anna = data.profiles["anna-mironova"], forma = data.profiles["forma-studio"];
  if (anna) post("profile", anna.slug, null, anna.name, anna.slug, "post", "Как мы собираем дизайн-систему за неделю",
    "Начинаем с аудита экранов, потом токены, потом компоненты. Главное — договориться о названиях до первой кнопки.", [], 2000);
  if (forma) post("profile", forma.slug, null, forma.name, forma.slug, "result", "Запустили сайт для фестиваля «Новая форма»",
    "Три недели, четыре человека и одна большая анимация на главной. Спасибо команде!", [], 3000);
  const pulse = data.projectDetails.pulse;
  if (pulse) post("project", "pulse", null, pulse.owner_name, pulse.owner_slug, "result", "Бета открыта для первых 300 человек",
    "Собрали обратную связь от тестировщиков: больше всего просят тёмную тему и напоминания.", [], 1500);
}

export function sessionUser(state) {
  try { return state.users.find((u) => u.id === Number(sessionStorage.getItem(SESSION) || localStorage.getItem(SESSION))) || null; }
  catch { fail(503, "Разрешите хранение данных сайта для демо-входа"); }
}
export function signOut() { localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION); return { ok: true }; }
function signIn(user, remember = false) {
  try { signOut(); (remember ? localStorage : sessionStorage).setItem(SESSION, String(user.id)); }
  catch { fail(503, "Не удалось сохранить демо-вход. Разрешите хранение данных сайта"); }
  return publicUser(user);
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 120000,
    salt: new TextEncoder().encode(salt) }, key, 256);
  return Array.from(new Uint8Array(bits), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function authRequest(route, method, body, state, data) {
  if (route === "/api/auth/me" && method === "GET") { const u = sessionUser(state); return { user: u ? publicUser(u) : null }; }
  if (route === "/api/auth/demo" && method === "GET") return { enabled: true, local: true, email: "demo@sreda.dev", password: DEMO_PASSWORD };
  if (route === "/api/auth/demo" && method === "POST") {
    if (!["user", "admin"].includes(body.role)) fail(422, "Выберите роль");
    const preset = state.users.find((u) => u.id === (body.role === "admin" ? 2 : 1));
    preset.is_admin = body.role === "admin";
    save(state);
    return signIn(preset);
  }
  if (route === "/api/auth/logout" && method === "POST") return signOut();
  if (route === "/api/auth/login" && method === "POST") {
    const u = state.users.find((u) => u.email === String(body.email || "").trim().toLowerCase());
    if (!u || !(u.demo ? body.password === DEMO_PASSWORD : await passwordHash(String(body.password || ""), u.salt) === u.hash)) fail(401, "Неверная почта или пароль");
    return signIn(u, Boolean(body.remember));
  }
  if (route === "/api/auth/register" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase(), errors = textErrors(body, { name: [2, 80], password: [8, 200] });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Укажите корректную почту";
    if (!body.accept_terms) errors.accept_terms = "Нужно принять условия использования";
    const org = body.account_type === "org";
    if (org && String(body.org_name || "").trim().length < 2) errors.org_name = "Укажите название организации";
    if (org && body.org_website && !/^https?:\/\//i.test(body.org_website)) errors.org_website = "Ссылка должна начинаться с https://";
    validate(errors);
    if (state.users.some((u) => u.email === email)) fail(409, "Эта почта уже используется", { email: "Эта почта уже используется" });
    const salt = crypto.randomUUID(), hash = await passwordHash(body.password, salt);
    const fresh = readState(data); // Preserve changes made during asynchronous hashing.
    if (fresh.users.some((u) => u.email === email)) fail(409, "Эта почта уже используется", { email: "Эта почта уже используется" });
    const u = { id: Math.max(...fresh.users.map((u) => u.id)) + 1, name: body.name.trim().replace(/\s+/g, " "),
      email, is_admin: false, account_type: org ? "org" : "person", created_at: now(), salt, hash };
    fresh.users.push(u);
    if (org) {
      // черновик анкеты организации — дополняется в кабинете и уходит на модерацию
      const name = body.org_name.trim(), about = String(body.org_about || "").trim() || `${name} — организация в Среде.`;
      fresh.profiles.push({ id: nextId(fresh), slug: `org-${crypto.randomUUID().slice(0, 8)}`, kind: "studio", name, role: "Организация",
        avatar: null, cover: null, city: String(body.org_city || "").trim() || "Не указан", formats: [], directions: [], tags: [],
        about: about.slice(0, 240), verified: false, open: true, popularity: 0, user_id: u.id, status: "pending", moderation_note: "",
        details: { bio: about, skills: [], work_format: "Проектная работа", portfolio: [], experience: [], reviews: [], participation: [],
          contacts: body.org_website ? [{ label: "Сайт", icon: "link", url: body.org_website }] : [], staff: [],
          staff_visibility: "all", show_staff_count: true, draft: true } });
    }
    save(fresh);
    return signIn(u, true);
  }
  fail(405, "Это действие недоступно");
}
