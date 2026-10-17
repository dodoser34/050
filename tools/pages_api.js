/** Read-only API for the exported GitHub Pages demo. Server mode uses core/api.js. */
const BASE = __BASE_PATH__;
const snapshot = fetch(new URL("./pages-data.json", import.meta.url)).then((response) => {
  if (!response.ok) throw new Error("Не удалось загрузить демо-контент");
  return response.json();
});

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.detail || "Ошибка запроса");
    this.status = status;
    this.errors = data?.errors || {};
  }
}

const matches = (query, ...fields) => !query.trim() || fields.some((field) =>
  (Array.isArray(field) ? field.join(" ") : String(field || "")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
const enabled = (params, key) => ["true", "1"].includes(params.get(key));

export async function api(path, { method = "GET" } = {}) {
  if (method !== "GET") throw new ApiError(405, {
    detail: "В демоверсии доступен просмотр. Для сохранения изменений нужна полная версия с сервером.",
  });
  const data = await snapshot;
  const url = new URL(path, location.origin);
  const route = BASE !== "/" && url.pathname.startsWith(BASE)
    ? "/" + url.pathname.slice(BASE.length) : url.pathname;
  const params = url.searchParams;
  const q = params.get("q") || "";
  if (route === "/api/auth/me") return { user: null };
  if (route === "/api/auth/demo") return { enabled: false };
  if (route === "/api/home") return data.home;
  if (route === "/api/projects/meta") return data.projectsMeta;
  if (route === "/api/specialists/meta") return data.specialistsMeta;
  if (route === "/api/specialists") {
    const directions = params.getAll("direction"), formats = params.getAll("format");
    const items = data.specialists.items.filter((s) =>
      matches(q, s.name, s.role, s.tags, s.directions) &&
      (!params.get("kind") || s.kind === params.get("kind")) &&
      (!params.get("city") || s.city === params.get("city")) &&
      (!directions.length || directions.some((d) => s.directions.includes(d))) &&
      (!formats.length || formats.some((f) => s.formats.includes(f))) &&
      (!enabled(params, "available") || s.open));
    items.sort(params.get("sort") === "name" ? (a, b) => a.name.localeCompare(b.name, "ru")
      : params.get("sort") === "new" ? (a, b) => b.id - a.id : (a, b) => b.popularity - a.popularity);
    return { total: items.length, items };
  }
  if (route === "/api/projects") {
    const items = data.projects.items.filter((p) =>
      !enabled(params, "mine") && matches(q, p.title, p.description, p.tags, p.owner_name) &&
      (!params.get("tag") || p.tags.includes(params.get("tag"))) &&
      (!params.get("stage") || p.stage === params.get("stage")) &&
      (!params.get("role") || p.roles.includes(params.get("role"))) &&
      (!params.get("license") || p.license === params.get("license")) &&
      (!enabled(params, "beta") || p.beta) && (!enabled(params, "has_roles") || p.roles.length));
    items.sort(params.get("sort") === "new" ? (a, b) => b.id - a.id : (a, b) => b.likes - a.likes);
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 3));
    return { total: items.length, items: items.slice(offset, offset + limit) };
  }
  if (route === "/api/search") {
    if (q.trim().length < 2) return { people: [], studios: [], projects: [] };
    const found = data.specialists.items.filter((s) => matches(q, s.name, s.role, s.tags));
    return {
      people: found.filter((s) => s.kind === "person").slice(0, 4),
      studios: found.filter((s) => s.kind === "studio").slice(0, 3),
      projects: data.projects.items.filter((p) => matches(q, p.title, p.description, p.tags)).slice(0, 4),
    };
  }
  if (route.startsWith("/api/specialists/")) {
    const profile = data.profiles[decodeURIComponent(route.slice("/api/specialists/".length))];
    if (profile) return profile;
  }
  if (route.startsWith("/api/projects/")) {
    const project = data.projectDetails[decodeURIComponent(route.slice("/api/projects/".length))];
    if (project) return project;
  }
  throw new ApiError(404, { detail: "Страница не найдена" });
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: "POST", body });
