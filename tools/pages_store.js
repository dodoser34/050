/** Local demo state. Never connects to the production API or exports real accounts. */
const BASE = __BASE_PATH__;
const KEY = `sreda:pages:v1:${BASE}`, SESSION = `${KEY}:session`;
export const DEMO_PASSWORD = "demo-sreda-2026";
export const copy = (value) => structuredClone(value);
export class ApiError extends Error {
  constructor(status, data) { super(data?.detail || "Ошибка запроса"); this.status = status; this.errors = data?.errors || {}; }
}
export const fail = (status, detail, errors = {}) => { throw new ApiError(status, { detail, errors }); };
export const publicUser = ({ id, name, email, is_admin }) => ({ id, name, email, is_admin });
export const validate = (errors) => { if (Object.keys(errors).length) fail(422, "Проверьте поля формы", errors); };
export const textErrors = (body, rules) => Object.fromEntries(Object.entries(rules).filter(([key, [min, max]]) =>
  typeof body[key] !== "string" || body[key].trim().length < min || body[key].length > max)
  .map(([key, [min, max]]) => [key, `От ${min} до ${max} символов`]));
const now = () => new Date().toISOString();

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { fail(503, "Не удалось сохранить демо. Разрешите хранение данных сайта и проверьте свободное место"); }
}
export function readState(data) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.version === 1 && ["users", "projects", "profiles", "likes", "bookmarks", "applications", "invitations"].every((k) => Array.isArray(state[k]))) return state;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) fail(503, "Разрешите сохранение данных сайта в браузере для демо");
  }
  const project = copy(data.projectDetails[data.projects.items[0].slug]);
  const profile = copy(data.profiles[data.specialists.items.find((s) => s.kind === "person").slug]);
  const own = { ...project, author_id: 1, owner_slug: null, owner_name: "Алексей Демо", owner_logo: null,
    team: [], likes: 0, details: {}, created_at: now() };
  const state = { version: 1,
    users: [
      { id: 1, name: "Алексей Демо", email: "demo@sreda.dev", is_admin: false, created_at: now(), demo: true },
      { id: 2, name: "Администратор", email: "admin@sreda.dev", is_admin: true, created_at: now(), demo: true },
    ],
    projects: [{ ...own, id: 1001, slug: "demo-zerno", title: "Зерно", status: "approved" },
      { ...own, id: 1002, slug: "demo-workshop", title: "Творческая мастерская", status: "pending" }],
    profiles: [{ ...profile, id: 1001, slug: "demo-member", user_id: 1, name: "Алексей Демо",
      verified: false, popularity: 0, status: "pending", moderation_note: "" }],
    likes: [], bookmarks: [], applications: [], invitations: [], featured: {} };
  save(state);
  return state;
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
    validate(errors);
    if (state.users.some((u) => u.email === email)) fail(409, "Эта почта уже используется", { email: "Эта почта уже используется" });
    const salt = crypto.randomUUID(), hash = await passwordHash(body.password, salt);
    const fresh = readState(data); // Preserve changes made during asynchronous hashing.
    if (fresh.users.some((u) => u.email === email)) fail(409, "Эта почта уже используется", { email: "Эта почта уже используется" });
    const u = { id: Math.max(...fresh.users.map((u) => u.id)) + 1, name: body.name.trim().replace(/\s+/g, " "),
      email, is_admin: false, created_at: now(), salt, hash };
    fresh.users.push(u); save(fresh);
    return signIn(u, true);
  }
  fail(405, "Это действие недоступно");
}

export function writeRequest(route, method, body, state, user, data) {
  if (!user) fail(401, "Войдите, чтобы продолжить");
  const commit = (result) => { save(state); return result; };
  if (route.startsWith("/api/admin/")) {
    if (!user.is_admin) fail(403, "Доступ только для администратора");
    const moderate = route.match(/^\/api\/admin\/(specialists|projects)\/([^/]+)\/moderate$/);
    if (moderate && method === "POST") {
      if (!["approve", "reject"].includes(body.action)) fail(422, "Неизвестное действие");
      if (body.action === "reject" && !String(body.note || "").trim()) fail(422, "Укажите причину отклонения — автор её увидит");
      const item = (moderate[1] === "projects" ? state.projects : state.profiles).find((p) => p.slug === decodeURIComponent(moderate[2]));
      if (!item) fail(404, "Материал не найден");
      item.status = body.action === "approve" ? "approved" : "rejected";
      item.moderation_note = item.status === "rejected" ? body.note.trim().slice(0, 500) : "";
      return commit({ ok: true, status: item.status });
    }
    const role = route.match(/^\/api\/admin\/users\/(\d+)\/admin$/);
    if (role && method === "POST") {
      const u = state.users.find((u) => u.id === Number(role[1]));
      if (!u) fail(404, "Пользователь не найден");
      if (u.id === user.id && !body.is_admin) fail(400, "Нельзя снять права администратора с самого себя");
      u.is_admin = Boolean(body.is_admin);
      return commit({ ok: true, is_admin: u.is_admin });
    }
    if (route === "/api/admin/featured" && method === "PUT") {
      const profiles = [...Object.values(data.profiles), ...state.profiles], projects = [...data.projects.items, ...state.projects];
      for (const [key, items] of [["freelancer", profiles.filter((p) => p.kind === "person")], ["team", profiles.filter((p) => p.kind === "studio")], ["project", projects]]) {
        if (body[key] && !items.some((p) => p.slug === body[key] && p.status === "approved")) fail(422, "Выберите опубликованный материал");
      }
      state.featured = { freelancer: body.freelancer || "", team: body.team || "", project: body.project || "" };
      return commit(state.featured);
    }
  }
  if (route === "/api/me/profile" && method === "PUT") {
    const errors = textErrors(body, { name: [2, 80], role: [2, 80], city: [2, 60], bio: [20, 1200] });
    if (!["person", "studio"].includes(body.kind)) errors.kind = "Выберите тип анкеты";
    if (!Array.isArray(body.directions) || !body.directions.length || body.directions.length > 4 || body.directions.some((d) => !data.specialistsMeta.directions.includes(d))) errors.directions = "Выберите от 1 до 4 направлений";
    for (const key of ["website", "telegram"]) if (body[key] && !/^https?:\/\//i.test(body[key]) && !(key === "telegram" && /^@[\w]+$/.test(body[key]))) errors[key] = "Укажите ссылку с https://";
    if ((body.portfolio || []).some((w) => !w.title || w.title.trim().length < 2)) errors.title = "Название — минимум 2 символа";
    if ((body.experience || []).some((w) => !w.place || w.place.trim().length < 2)) errors.place = "Название — минимум 2 символа";
    validate(errors);
    const profile = state.profiles.find((p) => p.user_id === user.id), contacts = [];
    if (body.telegram) contacts.push({ label: "Telegram", icon: "send", url: body.telegram.startsWith("@") ? `https://t.me/${body.telegram.slice(1)}` : body.telegram });
    if (body.website) contacts.push({ label: "Сайт", icon: "link", url: body.website });
    const saved = { ...copy(body), id: profile?.id || Date.now(), slug: profile?.slug || `member-${crypto.randomUUID()}`,
      user_id: user.id, name: body.name.trim(), about: body.bio.trim().slice(0, 240), avatar: null, cover: null,
      popularity: 0, verified: false, status: user.is_admin ? "approved" : "pending", moderation_note: "",
      details: { bio: body.bio.trim(), skills: body.skills || [], contacts, work_format: (body.formats || []).join(" / "),
        portfolio: (body.portfolio || []).map((w) => ({ ...w, cover: null })), experience: body.experience || [], reviews: [], participation: [] } };
    if (profile) state.profiles[state.profiles.indexOf(profile)] = saved; else state.profiles.push(saved);
    return commit({ profile: saved });
  }
  if (route === "/api/projects" && method === "POST") {
    const errors = textErrors(body, { title: [2, 80], description: [10, 400] });
    if (!data.projectsMeta.categories.includes(body.category)) errors.category = "Выберите направление";
    if (!data.projectsMeta.stages.includes(body.stage)) errors.stage = "Выберите стадию";
    if (!Array.isArray(body.roles) || body.roles.length > 5) errors.roles = "Укажите не более 5 ролей";
    validate(errors);
    const p = { id: Date.now(), slug: `project-${crypto.randomUUID()}`, title: body.title.trim(), description: body.description.trim(),
      category: body.category, tags: [body.category], stage: body.stage, roles: [...new Set(body.roles.map((r) => r.trim().slice(0, 40)).filter(Boolean))],
      license: "Закрытая", beta: Boolean(body.beta), cover: null, owner_slug: null, owner_name: user.name, owner_logo: null,
      team: [], likes: 0, author_id: user.id, status: user.is_admin ? "approved" : "pending", moderation_note: "", details: {}, created_at: now() };
    state.projects.push(p); return commit(p);
  }
  const action = route.match(/^\/api\/(projects|specialists)\/([^/]+)\/(like|apply|bookmark|invite)$/);
  if (action && method === "POST") {
    const [, type, value, operation] = action;
    const items = type === "projects" ? [...data.projects.items, ...state.projects] : [...Object.values(data.profiles), ...state.profiles];
    const item = items.find((p) => p.status === "approved" && (operation === "like" ? p.id === Number(value) : p.slug === decodeURIComponent(value)));
    if (!item) fail(404, "Материал не найден");
    if (operation === "like" || operation === "bookmark") {
      const list = operation === "like" ? state.likes : state.bookmarks, key = operation === "like" ? "project_id" : "slug", target = operation === "like" ? item.id : item.slug;
      const index = list.findIndex((x) => x.user_id === user.id && x[key] === target);
      if (index < 0) list.push({ user_id: user.id, [key]: target }); else list.splice(index, 1);
      return commit(operation === "like" ? { liked: index < 0, likes: item.likes + list.filter((x) => x.project_id === item.id).length } : { bookmarked: index < 0 });
    }
    validate(textErrors(body, { message: [5, 1000] }));
    if (operation === "apply") {
      if (item.author_id === user.id) fail(400, "Это ваш проект — откликаться на него не нужно");
      if (state.applications.some((a) => a.user_id === user.id && a.project_id === item.id)) fail(409, "Вы уже откликнулись на этот проект");
      state.applications.push({ user_id: user.id, project_id: item.id, role: body.role || "", message: body.message });
    } else state.invitations.push({ user_id: user.id, slug: item.slug, message: body.message });
    return commit({ ok: true });
  }
  fail(405, "Это действие недоступно");
}
