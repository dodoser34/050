/** Browser-local API for GitHub Pages. Server mode uses core/api.js. */
import { ApiError, authRequest, copy, fail, publicUser, readState, save, sessionUser } from "./pages-store.js";
import { context, projectDetail, projectOut, profileDetail, socialGet, socialWrite, touch } from "./pages-social.js";
export { ApiError } from "./pages-store.js";
const BASE = __BASE_PATH__;
const snapshot = fetch(new URL("./pages-data.json", import.meta.url)).then((response) => {
  if (!response.ok) throw new Error("Не удалось загрузить демо-контент");
  return response.json();
});

const matches = (query, ...fields) => !query.trim() || fields.some((field) =>
  (Array.isArray(field) ? field.join(" ") : String(field || "")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
const enabled = (params, key) => ["true", "1"].includes(params.get(key));

export async function api(path, { method = "GET", body = {} } = {}) {
  const data = await snapshot;
  const state = readState(data), user = sessionUser(state);
  const url = new URL(path, location.origin);
  const route = BASE !== "/" && url.pathname.startsWith(BASE)
    ? "/" + url.pathname.slice(BASE.length) : url.pathname;
  const params = url.searchParams;
  const q = params.get("q") || "";
  if (route.startsWith("/api/auth/")) return authRequest(route, method, body, state, data);
  if (user && touch(state, user)) save(state);
  const ctx = context(state, user, data);
  if (method !== "GET") {
    if (!user) fail(401, "Войдите, чтобы продолжить");
    const result = socialWrite(route, method, body || {}, ctx);
    if (result !== undefined) return result;
    fail(405, "Это действие недоступно");
  }
  const auth = () => { if (!user) fail(401, "Войдите, чтобы продолжить"); };
  if (route.startsWith("/api/admin/")) {
    auth();
    if (!user.is_admin) fail(403, "Доступ только для администратора");
  }
  const social = socialGet(route, params, ctx);
  if (social !== undefined) return social;

  const profileOut = (p) => ({ ...copy(p), details: undefined, bookmarked: state.bookmarks.some((b) => b.user_id === user?.id && b.slug === p.slug),
    online: !p.user_id && (p.slug.length * 7 + p.slug.charCodeAt(0)) % 3 === 0 });
  const { projects, profiles } = ctx;
  const publishedProjects = projects.filter((p) => p.status === "approved"), publishedProfiles = profiles.filter((p) => p.status === "approved");
  const directionsAll = [...new Set([...data.specialistsMeta.all_directions || data.specialistsMeta.directions, ...publishedProfiles.flatMap((p) => p.directions)])];
  if (route === "/api/me/profile") {
    auth();
    const p = state.profiles.find((p) => p.user_id === user.id);
    return { profile: p ? profileDetail(ctx, p.slug) : null, directions: directionsAll, account_type: user.account_type || "person",
      my_projects: state.projects.filter((x) => x.author_id === user.id).map((x) => ({ slug: x.slug, title: x.title })) };
  }
  if (route.startsWith("/api/admin/")) {
    if (route === "/api/admin/stats") return { users: state.users.length, specialists: publishedProfiles.length, projects: publishedProjects.length,
      pending_specialists: state.profiles.filter((p) => p.status === "pending").length, pending_projects: state.projects.filter((p) => p.status === "pending").length,
      applications: state.applications.length, invitations: state.invitations.length, reports: state.reports.filter((r) => r.status === "open").length };
    if (route === "/api/admin/moderation") {
      const status = params.get("status") || "pending";
      if (!["pending", "approved", "rejected"].includes(status)) fail(422, "Неизвестный статус");
      const submitted = (p, key) => publicUser(state.users.find((u) => u.id === p[key]));
      return { specialists: state.profiles.filter((p) => p.status === status).map((p) => ({ ...copy(p), submitter: submitted(p, "user_id") })),
        projects: state.projects.filter((p) => p.status === status).map((p) => ({ ...projectOut(ctx, p), moderation_note: p.moderation_note, submitter: submitted(p, "author_id") })) };
    }
    if (route === "/api/admin/featured") return copy(state.featured);
    if (route === "/api/admin/users") return state.users.map((u) => ({ ...publicUser(u), created_at: u.created_at,
      profile_status: state.profiles.find((p) => p.user_id === u.id)?.status || null, projects: state.projects.filter((p) => p.author_id === u.id).length }));
  }
  if (route === "/api/home") {
    const home = copy(data.home);
    for (const [key, items, output] of [["freelancer", publishedProfiles, profileOut], ["team", publishedProfiles, profileOut], ["project", publishedProjects, (p) => projectOut(ctx, p)]]) {
      const selected = items.find((p) => p.slug === state.featured[key]), item = selected || home[key];
      if (item) home[key] = { ...output(item), featured: Boolean(selected), ...(key === "team" ? { thumbs: selected ? (item.details?.portfolio || []).slice(0, 4) : item.thumbs } : {}) };
    }
    return home;
  }
  if (route === "/api/projects/meta") return { ...data.projectsMeta,
    categories: [...new Set([...data.projectsMeta.categories, ...publishedProjects.map((p) => p.category)])] };
  if (route === "/api/specialists/meta") {
    const used = new Set(publishedProfiles.flatMap((p) => p.directions));
    return { ...data.specialistsMeta, directions: directionsAll.filter((d) => used.has(d)), all_directions: directionsAll,
      cities: [...new Set(publishedProfiles.map((p) => p.city))].sort() };
  }
  if (route === "/api/specialists") {
    const directions = params.getAll("direction"), formats = params.getAll("format");
    const items = publishedProfiles.filter((s) =>
      matches(q, s.name, s.role, s.tags, s.directions) &&
      (!params.get("kind") || s.kind === params.get("kind")) &&
      (!params.get("city") || s.city === params.get("city")) &&
      (!directions.length || directions.some((d) => s.directions.includes(d))) &&
      (!formats.length || formats.some((f) => s.formats.includes(f))) &&
      (!enabled(params, "available") || s.open)).map(profileOut);
    items.sort(params.get("sort") === "name" ? (a, b) => a.name.localeCompare(b.name, "ru")
      : params.get("sort") === "new" ? (a, b) => b.id - a.id : (a, b) => b.popularity - a.popularity);
    return { total: items.length, items };
  }
  if (route === "/api/projects") {
    if (enabled(params, "mine")) auth();
    const items = projects.filter((p) =>
      (enabled(params, "mine") ? p.author_id === user.id : p.status === "approved") && matches(q, p.title, p.description, p.tags, p.owner_name) &&
      (!params.get("tag") || p.tags.includes(params.get("tag")) || p.category === params.get("tag")) &&
      (!params.get("stage") || p.stage === params.get("stage")) &&
      (!params.get("role") || p.roles.includes(params.get("role"))) &&
      (!params.get("license") || p.license === params.get("license")) &&
      (!enabled(params, "beta") || p.beta) && (!enabled(params, "has_roles") || (p.roles.length && !p.closed))).map((p) => projectOut(ctx, p));
    items.sort((a, b) => Number(a.closed) - Number(b.closed) || (params.get("sort") === "new" ? b.id - a.id : b.likes - a.likes));
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 3));
    return { total: items.length, items: items.slice(offset, offset + limit) };
  }
  if (route === "/api/search") {
    if (q.trim().length < 2) return { people: [], studios: [], projects: [] };
    const found = publishedProfiles.filter((s) => matches(q, s.name, s.role, s.tags)).map(profileOut);
    return {
      people: found.filter((s) => s.kind === "person").slice(0, 4),
      studios: found.filter((s) => s.kind === "studio").slice(0, 3),
      projects: publishedProjects.filter((p) => matches(q, p.title, p.description, p.tags)).slice(0, 4).map((p) => projectOut(ctx, p)),
    };
  }
  if (route.startsWith("/api/specialists/")) return profileDetail(ctx, decodeURIComponent(route.slice("/api/specialists/".length)));
  if (route.startsWith("/api/projects/")) return projectDetail(ctx, decodeURIComponent(route.slice("/api/projects/".length)));
  throw new ApiError(404, { detail: "Страница не найдена" });
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: "POST", body });
