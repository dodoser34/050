/** Browser-local API for GitHub Pages. Server mode uses core/api.js. */
import { ApiError, authRequest, copy, fail, publicUser, readState, sessionUser, writeRequest } from "./pages-store.js";
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
  if (method !== "GET") return writeRequest(route, method, body, state, user, data);
  const auth = () => { if (!user) fail(401, "Войдите, чтобы продолжить"); };
  const projectOut = (p) => ({ ...copy(p), liked: state.likes.some((l) => l.user_id === user?.id && l.project_id === p.id),
    likes: p.likes + state.likes.filter((l) => l.project_id === p.id).length });
  const profileOut = (p) => ({ ...copy(p), bookmarked: state.bookmarks.some((b) => b.user_id === user?.id && b.slug === p.slug) });
  const projects = [...data.projects.items, ...state.projects], profiles = [...Object.values(data.profiles), ...state.profiles];
  const publishedProjects = projects.filter((p) => p.status === "approved"), publishedProfiles = profiles.filter((p) => p.status === "approved");
  const visible = (p, key) => p.status === "approved" || user && (user.is_admin || p[key] === user.id);
  if (route === "/api/me/profile") {
    auth();
    const p = state.profiles.find((p) => p.user_id === user.id);
    return { profile: p ? profileOut(p) : null, directions: data.specialistsMeta.directions };
  }
  if (route.startsWith("/api/admin/")) {
    auth();
    if (!user.is_admin) fail(403, "Доступ только для администратора");
    if (route === "/api/admin/stats") return { users: state.users.length, specialists: publishedProfiles.length, projects: publishedProjects.length,
      pending_specialists: state.profiles.filter((p) => p.status === "pending").length, pending_projects: state.projects.filter((p) => p.status === "pending").length,
      applications: state.applications.length, invitations: state.invitations.length };
    if (route === "/api/admin/moderation") {
      const status = params.get("status") || "pending";
      if (!["pending", "approved", "rejected"].includes(status)) fail(422, "Неизвестный статус");
      const submitted = (p, key) => publicUser(state.users.find((u) => u.id === p[key]));
      return { specialists: state.profiles.filter((p) => p.status === status).map((p) => ({ ...profileOut(p), submitter: submitted(p, "user_id") })),
        projects: state.projects.filter((p) => p.status === status).map((p) => ({ ...projectOut(p), submitter: submitted(p, "author_id") })) };
    }
    if (route === "/api/admin/featured") return copy(state.featured);
    if (route === "/api/admin/users") return state.users.map((u) => ({ ...publicUser(u), created_at: u.created_at,
      profile_status: state.profiles.find((p) => p.user_id === u.id)?.status || null, projects: state.projects.filter((p) => p.author_id === u.id).length }));
  }
  if (route === "/api/home") {
    const home = copy(data.home);
    for (const [key, items, output] of [["freelancer", publishedProfiles, profileOut], ["team", publishedProfiles, profileOut], ["project", publishedProjects, projectOut]]) {
      const selected = items.find((p) => p.slug === state.featured[key]), item = selected || home[key];
      if (item) home[key] = { ...output(item), featured: Boolean(selected), ...(key === "team" ? { thumbs: selected ? (item.details?.portfolio || []).slice(0, 4) : item.thumbs } : {}) };
    }
    return home;
  }
  if (route === "/api/projects/meta") return data.projectsMeta;
  if (route === "/api/specialists/meta") return { ...data.specialistsMeta, cities: [...new Set(publishedProfiles.map((p) => p.city))].sort() };
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
      (!params.get("tag") || p.tags.includes(params.get("tag"))) &&
      (!params.get("stage") || p.stage === params.get("stage")) &&
      (!params.get("role") || p.roles.includes(params.get("role"))) &&
      (!params.get("license") || p.license === params.get("license")) &&
      (!enabled(params, "beta") || p.beta) && (!enabled(params, "has_roles") || p.roles.length)).map(projectOut);
    items.sort(params.get("sort") === "new" ? (a, b) => b.id - a.id : (a, b) => b.likes - a.likes);
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
      projects: publishedProjects.filter((p) => matches(q, p.title, p.description, p.tags)).slice(0, 4).map(projectOut),
    };
  }
  if (route.startsWith("/api/specialists/")) {
    const profile = profiles.find((p) => p.slug === decodeURIComponent(route.slice("/api/specialists/".length)));
    if (profile && visible(profile, "user_id")) return { ...profileOut(profile), is_owner: Boolean(user && profile.user_id === user.id),
      details: { ...copy(profile.details), participation: publishedProjects.filter((p) => p.owner_slug === profile.slug || p.team.some((m) => m.slug === profile.slug)).map(projectOut) } };
  }
  if (route.startsWith("/api/projects/")) {
    const slug = decodeURIComponent(route.slice("/api/projects/".length));
    const project = state.projects.find((p) => p.slug === slug) || data.projectDetails[slug];
    if (project && visible(project, "author_id")) return { ...projectOut(project), owner: profiles.find((p) => p.slug === project.owner_slug) || null,
      stages: data.projectsMeta.stages, is_author: Boolean(user && project.author_id === user.id),
      applied: state.applications.some((a) => a.user_id === user?.id && a.project_id === project.id),
      related: publishedProjects.filter((p) => p.slug !== slug).slice(0, 3).map(projectOut) };
  }
  throw new ApiError(404, { detail: "Страница не найдена" });
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: "POST", body });
