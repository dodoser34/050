/** Browser-local versions of the server scenarios for the GitHub Pages demo:
 *  projects and profiles (with privacy and rights), applications, messages, notifications,
 *  feeds and blogs, reports, settings and moderation. Mirrors backend/app/features/*. */
import { appUrl, copy, fail, nextId, now, pageUrl, save, textErrors, validate } from "./pages-store.js";

const ONLINE_WINDOW = 5 * 60 * 1000;
const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "rutube.ru", "vk.com", "vkvideo.ru"];
const REASONS = { plagiarism: "Плагиат или чужие работы", inappropriate: "Недопустимый контент", spam: "Спам или реклама",
  fraud: "Мошенничество", fake: "Выдаёт себя за другого", other: "Другое" };
const DEMO_REPLIES = [
  "Здравствуйте! Спасибо, что написали — посмотрю подробнее и вернусь с ответом сегодня вечером.",
  "Привет! Звучит интересно. Можете прислать пару примеров или ссылку на материалы?",
  "Спасибо! Давайте созвонимся на неделе — когда вам удобно?",
  "Добрый день! Рада знакомству. Расскажите, какие сроки у проекта?",
];
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
export const cleanRoles = (roles) => [...new Set((roles || []).map((r) => clean(r).slice(0, 40)).filter(Boolean).map(capFirst))];

// ---------- Контекст ----------

export function context(state, user, data) {
  const profiles = [...Object.values(data.profiles), ...state.profiles];
  const projects = [...data.projects.items.map((p) => ({ ...(data.projectDetails[p.slug] || p), ...p, details: data.projectDetails[p.slug]?.details || {} })), ...state.projects];
  const flags = Object.fromEntries(profiles.filter((p) => p.status === "approved").map((p) => [p.slug, { verified: p.verified, kind: p.kind, user_id: p.user_id || null }]));
  return { state, user, data, profiles, projects, flags };
}
const profileOfUser = (ctx, uid) => uid ? ctx.profiles.find((p) => p.user_id === uid) : null;

export function notify(state, user_id, kind, text, url = "") {
  if (user_id) state.notifications.push({ id: nextId(state), user_id, kind, text: text.slice(0, 300), url, read: false, created_at: now() });
}

// ---------- Статус «в сети» ----------

function demoPresence(slug) {
  const h = hash(slug);
  if (h % 3 === 0) return { online: true, last_seen: now() };
  return { online: false, last_seen: new Date(Date.now() - 600000 - (h % 70) * 2400000).toISOString() };
}
const areContacts = (state, a, b) => state.conversations.some((c) => (c.user_a === a && c.user_b === b) || (c.user_a === b && c.user_b === a));
export function presence(ctx, uid, slug) {
  if (!uid) return slug ? demoPresence(slug) : null;
  const u = ctx.state.users.find((x) => x.id === uid);
  if (!u) return null;
  const mode = u.settings?.show_online || "all", own = ctx.user?.id === uid;
  if (!own && (mode === "nobody" || (mode === "contacts" && !(ctx.user && areContacts(ctx.state, ctx.user.id, uid))))) return null;
  // в демо все пользователи живут в одном браузере: сейчас «в сети» тот, кто вошёл
  const last = own ? Date.now() : u.last_seen ? Date.parse(u.last_seen) : 0;
  return last ? { online: Date.now() - last < ONLINE_WINDOW, last_seen: new Date(last).toISOString() } : null;
}
export function touch(state, user) {
  const u = state.users.find((x) => x.id === user?.id);
  if (u && Date.now() - Date.parse(u.last_seen || 0) > 60000) { u.last_seen = now(); return true; }
  return false;
}

// ---------- Проекты ----------

const memberUsers = (ctx, team, onlyPosters = false) => new Set(team.filter((m) => ctx.flags[m.slug]?.user_id && (m.can_post || !onlyPosters)).map((m) => ctx.flags[m.slug].user_id));
export const owns = (ctx, p) => Boolean(ctx.user && (p.author_id === ctx.user.id || (ctx.flags[p.owner_slug]?.user_id && ctx.flags[p.owner_slug].user_id === ctx.user.id)));
export function projectAccess(ctx, p) {
  const manage = Boolean(ctx.user && (ctx.user.is_admin || owns(ctx, p)));
  const uid = ctx.user?.id;
  return { can_manage: manage, is_member: manage || Boolean(uid && memberUsers(ctx, p.team || []).has(uid)),
    can_post: manage || Boolean(uid && memberUsers(ctx, p.team || [], true).has(uid)) };
}

export function projectOut(ctx, p) {
  const out = copy(p);
  delete out.details;
  const access = projectAccess(ctx, p);
  out.liked = ctx.state.likes.some((l) => l.user_id === ctx.user?.id && l.project_id === p.id);
  out.likes = p.likes + ctx.state.likes.filter((l) => l.project_id === p.id).length;
  out.closed = Boolean(p.closed);
  out.owner_verified = ctx.flags[p.owner_slug]?.verified || false;
  out.owner_kind = ctx.flags[p.owner_slug]?.kind || "person";
  out.team = (p.team || []).map((m) => ({ ...m, verified: ctx.flags[m.slug]?.verified || false, kind: ctx.flags[m.slug]?.kind || "person" }));
  out.team_count = out.team.length;
  const d = p.details || {};
  out.team_visibility = d.team_visibility || "all";
  out.show_team_count = d.show_team_count !== false;
  if (!access.is_member && out.team_visibility !== "all") {
    out.team = out.team_visibility === "selected" ? out.team.filter((m) => m.visible !== false) : [];
    if (!out.show_team_count) out.team_count = null;
  }
  return out;
}

const visibleProject = (ctx, p) => p.status === "approved" || (ctx.user && (ctx.user.is_admin || p.author_id === ctx.user.id));

export function projectDetail(ctx, slug) {
  const p = ctx.projects.find((x) => x.slug === slug);
  if (!p || !visibleProject(ctx, p)) fail(404, "Проект не найден");
  const access = projectAccess(ctx, p);
  const out = projectOut(ctx, p);
  const ownerProfile = ctx.profiles.find((x) => x.slug === p.owner_slug);
  const application = ctx.user ? ctx.state.applications.find((a) => a.user_id === ctx.user.id && a.project_id === p.id) : null;
  const published = ctx.projects.filter((x) => x.status === "approved" && !x.closed && x.slug !== slug);
  return { ...out, details: copy(p.details || {}), stages: ctx.data.projectsMeta.stages, created_at: p.created_at,
    owner: ownerProfile ? { ...copy(ownerProfile), details: undefined, presence: presence(ctx, ownerProfile.user_id, ownerProfile.user_id ? null : ownerProfile.slug) } : null,
    application: application ? { id: application.id, status: application.status, conversation_id: application.conversation_id } : null,
    applied: Boolean(application), is_author: owns(ctx, p), ...access,
    pending_applications: access.can_manage ? ctx.state.applications.filter((a) => a.project_id === p.id && a.status === "pending").length : 0,
    status: p.status, moderation_note: p.moderation_note || "", blog_visibility: p.details?.blog_visibility || "all",
    related: [...published.filter((x) => x.category === p.category), ...published.filter((x) => x.category !== p.category)].slice(0, 3).map((x) => projectOut(ctx, x)) };
}

function stateProject(ctx, slug) {
  const p = ctx.state.projects.find((x) => x.slug === slug);
  if (!p) {
    if (ctx.projects.some((x) => x.slug === slug)) fail(403, "В демо управлять можно только проектами, созданными в этом браузере");
    fail(404, "Проект не найден");
  }
  if (!projectAccess(ctx, p).can_manage) fail(403, "Управлять проектом может только его автор");
  return p;
}

function projectErrors(ctx, body) {
  const errors = textErrors(body, { title: [2, 80], description: [10, 400] });
  const category = clean(body.category);
  if (category.length < 2 || category.length > 40) errors.category = "Выберите направление или добавьте своё";
  if (!ctx.data.projectsMeta.stages.includes(body.stage)) errors.stage = "Выберите стадию";
  if (!Array.isArray(body.roles) || body.roles.length > 8) errors.roles = "Укажите не более 8 ролей";
  validate(errors);
  return capFirst(category);
}

function createProject(ctx, body) {
  const { state, user } = ctx;
  const category = projectErrors(ctx, body);
  const profile = profileOfUser(ctx, user.id);
  const ownerProfile = profile?.status === "approved" ? profile : null;
  const p = { id: nextId(state), slug: `project-${crypto.randomUUID()}`, title: body.title.trim(), description: body.description.trim(),
    category, tags: [category], stage: body.stage, roles: cleanRoles(body.roles), license: "Закрытая", beta: Boolean(body.beta),
    cover: body.cover_data || null, owner_slug: ownerProfile?.slug || null, owner_name: ownerProfile?.name || user.name,
    owner_logo: ownerProfile?.avatar || null, team: [], likes: 0, author_id: user.id, closed: false,
    status: user.is_admin ? "approved" : "pending", moderation_note: "", details: {}, created_at: now() };
  state.projects.push(p);
  save(state);
  return projectOut(ctx, p);
}

function updateProject(ctx, slug, body) {
  const p = stateProject(ctx, slug);
  const category = projectErrors(ctx, body);
  if (!["all", "selected", "hidden"].includes(body.team_visibility || "all")) fail(422, "Неизвестная настройка видимости");
  if (body.cover_data) p.cover = body.cover_data; else if (body.remove_cover) p.cover = null;
  Object.assign(p, { title: body.title.trim(), description: body.description.trim(), category, stage: body.stage,
    roles: cleanRoles(body.roles), beta: Boolean(body.beta), closed: Boolean(body.closed) });
  if (!p.tags.includes(category)) p.tags = [category, ...p.tags.filter((t) => t !== p.category)];
  const about = String(body.about || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  p.details = { ...p.details, team_visibility: body.team_visibility || "all", show_team_count: body.show_team_count !== false,
    blog_visibility: body.blog_visibility === "members" ? "members" : "all" };
  if (about.length) p.details.about = about; else delete p.details.about;
  if (p.status === "rejected" && !ctx.user.is_admin) { p.status = "pending"; p.moderation_note = ""; }
  save(ctx.state);
  return projectDetail(context(ctx.state, ctx.user, ctx.data), slug);
}

function updateTeam(ctx, slug, body) {
  const p = stateProject(ctx, slug);
  const before = new Set((p.team || []).map((m) => m.slug));
  const team = [];
  for (const m of body.members || []) {
    const s = ctx.profiles.find((x) => x.slug === m.slug && x.status === "approved");
    if (!s || s.kind !== "person") fail(422, "В команду можно добавить только опубликованную анкету специалиста");
    if (team.some((x) => x.slug === s.slug)) continue;
    team.push({ slug: s.slug, name: s.name, role: clean(m.role) || s.role, avatar: s.avatar, can_post: Boolean(m.can_post), visible: m.visible !== false });
    if (!before.has(s.slug)) notify(ctx.state, s.user_id, "member", `Вас добавили в команду проекта «${p.title}»`, pageUrl("projects", slug));
  }
  p.team = team;
  save(ctx.state);
  return projectDetail(context(ctx.state, ctx.user, ctx.data), slug);
}

// ---------- Переписка ----------

function openConversation(state, a, b, peer_slug, project_id = null) {
  const found = state.conversations.find((c) => (b ? ((c.user_a === a && c.user_b === b) || (c.user_a === b && c.user_b === a))
    : (c.user_a === a && !c.user_b && c.peer_slug === peer_slug)) && (c.project_id || null) === (project_id || null));
  if (found) return found;
  const c = { id: nextId(state), user_a: a, user_b: b || null, peer_slug, project_id, created_at: now(), updated_at: now() };
  state.conversations.push(c);
  return c;
}
function addMessage(state, c, sender_id, body) {
  const m = { id: nextId(state), conversation_id: c.id, sender_id, body, created_at: now() };
  state.messages.push(m);
  c.updated_at = m.created_at;
  if (sender_id) state.reads[`${c.id}:${sender_id}`] = Math.max(state.reads[`${c.id}:${sender_id}`] || 0, m.id);
  return m;
}
function demoAnswer(state, c, slug) {
  const n = state.messages.filter((m) => m.conversation_id === c.id).length;
  addMessage(state, c, null, DEMO_REPLIES[(hash(slug) + n) % DEMO_REPLIES.length] + " (Это демо-анкета: ответ пришёл автоматически.)");
}
const unreadIn = (state, c, uid) => state.messages.filter((m) => m.conversation_id === c.id && m.sender_id !== uid && m.id > (state.reads[`${c.id}:${uid}`] || 0)).length;
const mine = (c, uid) => c.user_a === uid || c.user_b === uid;

function party(ctx, uid, slug) {
  const p = (slug && ctx.profiles.find((x) => x.slug === slug)) || profileOfUser(ctx, uid);
  if (p) return { name: p.name, slug: p.status === "approved" ? p.slug : null, avatar: p.avatar, kind: p.kind, verified: p.verified, role: p.role,
    presence: presence(ctx, p.user_id, p.user_id ? null : p.slug) };
  const u = ctx.state.users.find((x) => x.id === uid);
  return { name: u?.name || "Пользователь", slug: null, avatar: null, kind: "person", verified: false, role: "", presence: presence(ctx, uid) };
}
const peer = (ctx, c) => (c.user_a === ctx.user.id ? party(ctx, c.user_b, c.peer_slug) : party(ctx, c.user_a, null));
function convProject(ctx, c) {
  const p = c.project_id && ctx.projects.find((x) => x.id === c.project_id);
  return p ? { slug: p.slug, title: p.title, cover: p.cover } : null;
}

// ---------- Профили ----------

function participation(ctx, profile, viewerIsOwner) {
  const hidden = new Set(profile.details?.hidden_projects || []);
  return ctx.projects.filter((p) => p.status === "approved").sort((a, b) => Number(a.closed) - Number(b.closed) || b.likes - a.likes).flatMap((p) => {
    const member = (p.team || []).find((m) => m.slug === profile.slug);
    const founder = p.owner_slug === profile.slug || Boolean(profile.user_id && p.author_id === profile.user_id);
    if (!(member || founder) || (hidden.has(p.slug) && !viewerIsOwner)) return [];
    const vis = p.details?.team_visibility || "all";
    if (member && !founder && !viewerIsOwner && (vis === "hidden" || (vis === "selected" && member.visible === false))) return [];
    return [{ slug: p.slug, title: p.title, cover: p.cover, stage: p.stage, category: p.category, owner: founder, founder,
      closed: Boolean(p.closed), member_role: member?.role || "", hidden: hidden.has(p.slug) }];
  });
}

export function profileAccess(ctx, profile) {
  const uid = ctx.user?.id, staff = profile.details?.staff || [];
  const owner = Boolean(uid && profile.user_id === uid), admin = Boolean(ctx.user?.is_admin);
  return { is_owner: owner, is_member: owner || admin || Boolean(uid && memberUsers(ctx, staff).has(uid)),
    can_post: owner || admin || Boolean(uid && memberUsers(ctx, staff, true).has(uid)) };
}

export function profileDetail(ctx, slug) {
  const p = ctx.profiles.find((x) => x.slug === slug);
  if (!p || !(p.status === "approved" || (ctx.user && (ctx.user.is_admin || p.user_id === ctx.user.id)))) fail(404, "Профиль не найден");
  const isOwner = Boolean(ctx.user && p.user_id === ctx.user.id);
  const access = profileAccess(ctx, p);
  const out = copy(p);
  const d = out.details = { portfolio: [], experience: [], reviews: [], skills: [], contacts: [], work_format: "", ...out.details };
  d.participation = participation(ctx, p, isOwner);
  d.organizations = p.kind === "person" ? ctx.profiles.filter((o) => o.kind === "studio" && o.status === "approved").flatMap((o) => {
    const m = (o.details?.staff || []).find((x) => x.slug === slug), vis = o.details?.staff_visibility || "all";
    return m && (vis === "all" || (vis === "selected" && m.visible !== false)) ? [{ slug: o.slug, name: o.name, avatar: o.avatar, verified: o.verified, role: m.role || "" }] : [];
  }) : [];
  if (p.kind === "studio") {
    const staff = (d.staff || []).flatMap((m) => { const s = ctx.profiles.find((x) => x.slug === m.slug); return s ? [{ ...m, name: s.name, avatar: s.avatar, profile_role: s.role, verified: s.verified }] : []; });
    d.staff_visibility ||= "all";
    d.show_staff_count = d.show_staff_count !== false;
    d.staff_count = staff.length;
    d.staff = access.is_member || d.staff_visibility === "all" ? staff : d.staff_visibility === "selected" ? staff.filter((m) => m.visible !== false) : [];
    if (!access.is_member && d.staff_visibility !== "all" && !d.show_staff_count) d.staff_count = null;
  }
  if (!isOwner) delete d.hidden_projects;
  return { ...out, bookmarked: ctx.state.bookmarks.some((b) => b.user_id === ctx.user?.id && b.slug === p.slug), is_owner: isOwner,
    presence: presence(ctx, p.user_id, p.user_id ? null : p.slug), ...access, blog_visibility: d.blog_visibility || "all" };
}

function saveProfile(ctx, body) {
  const { state, user, data } = ctx;
  const errors = textErrors(body, { name: [2, 80], role: [2, 80], city: [2, 60], bio: [20, 1200] });
  if (!["person", "studio"].includes(body.kind)) errors.kind = "Выберите тип анкеты";
  const directions = [...new Set((body.directions || []).map(clean).filter(Boolean).map(capFirst))];
  if (!directions.length || directions.length > 6 || directions.some((d) => d.length < 2 || d.length > 40)) errors.directions = "Выберите от 1 до 6 направлений";
  for (const key of ["website", "telegram"]) if (body[key] && !/^https?:\/\//i.test(body[key]) && !(key === "telegram" && /^@[\w]+$/.test(body[key]))) errors[key] = "Укажите ссылку с https://";
  if ((body.portfolio || []).some((w) => !w.title || w.title.trim().length < 2)) errors.title = "Название — минимум 2 символа";
  if ((body.experience || []).some((w) => !w.place || w.place.trim().length < 2)) errors.place = "Название — минимум 2 символа";
  validate(errors);
  const profile = state.profiles.find((p) => p.user_id === user.id), old = profile?.details || {};
  const oldCovers = new Set((old.portfolio || []).map((w) => w.cover));
  const portfolio = (body.portfolio || []).map((w) => {
    const item = { type: w.type || "image", title: w.title.trim(), meta: clean(w.meta), description: String(w.description || "").trim() };
    let cover = w.image_data || (oldCovers.has(w.cover) ? w.cover : "");
    if (item.type === "video") {
      if (!w.video_url || !VIDEO_HOSTS.some((h) => w.video_url.includes(h))) fail(422, "Видео: укажите ссылку на YouTube, VK Видео, Rutube или Vimeo");
      item.video_url = w.video_url;
    }
    if (item.type === "project") {
      if (w.project_slug) {
        const p = ctx.projects.find((x) => x.slug === w.project_slug);
        if (!p) fail(422, "Проект для портфолио не найден");
        item.project_slug = p.slug; cover ||= p.cover;
      } else if (!w.url) fail(422, "Проект: выберите свой проект или укажите ссылку");
      item.url = w.url || "";
    }
    item.cover = cover || null;
    return item;
  });
  const contacts = [];
  if (body.telegram) contacts.push({ label: "Telegram", icon: "send", url: body.telegram.startsWith("@") ? `https://t.me/${body.telegram.slice(1)}` : body.telegram });
  if (body.website) contacts.push({ label: "Сайт", icon: "link", url: body.website });
  const kept = Object.fromEntries(["reviews", "staff", "staff_visibility", "show_staff_count", "hidden_projects", "blog_visibility"].filter((k) => k in old).map((k) => [k, old[k]]));
  const saved = { ...(profile || {}), kind: body.kind, name: body.name.trim(), role: body.role.trim(), city: body.city.trim(),
    formats: body.formats || [], directions, tags: body.tags || [], open: body.open !== false,
    id: profile?.id || nextId(state), slug: profile?.slug || `member-${crypto.randomUUID()}`,
    user_id: user.id, about: body.bio.trim().split(". ")[0].replace(/\.$/, "").slice(0, 238) + ".",
    avatar: body.avatar_data || profile?.avatar || null, cover: portfolio.find((w) => w.cover)?.cover || profile?.cover || null,
    popularity: profile?.popularity || 0, verified: profile?.verified || false, status: user.is_admin ? "approved" : "pending", moderation_note: "",
    details: { bio: body.bio.trim(), skills: body.skills || [], contacts, work_format: "Проектная работа" + ((body.formats || []).length ? " · " + body.formats.join(" / ") : ""),
      portfolio, experience: body.experience || [], reviews: [], participation: [], ...kept } };
  if (profile) state.profiles[state.profiles.indexOf(profile)] = saved; else state.profiles.push(saved);
  const u = state.users.find((x) => x.id === user.id);
  u.account_type = body.kind === "studio" ? "org" : "person";
  save(state);
  return { profile: saved };
}

// ---------- Посты ----------

function feedOwner(ctx, type, slug) {
  if (type === "project") {
    const p = ctx.projects.find((x) => x.slug === slug);
    if (!p || !visibleProject(ctx, p)) fail(404, "Проект не найден");
    const a = projectAccess(ctx, p);
    return { row: p, title: p.title, access: { ...a, can_moderate: a.can_manage, blog_visibility: p.details?.blog_visibility || "all" } };
  }
  const p = ctx.profiles.find((x) => x.slug === slug);
  if (!p || !(p.status === "approved" || (ctx.user && (ctx.user.is_admin || p.user_id === ctx.user.id)))) fail(404, "Профиль не найден");
  const a = profileAccess(ctx, p);
  return { row: p, title: p.name, access: { ...a, can_moderate: a.is_owner || Boolean(ctx.user?.is_admin), blog_visibility: p.details?.blog_visibility || "all" } };
}
function postOut(ctx, r, access) {
  let poll = null;
  if (r.kind === "poll") {
    const votes = ctx.state.votes.filter((v) => v.post_id === r.id);
    const myVote = votes.find((v) => v.user_id === ctx.user?.id);
    poll = { options: r.poll.map((text, i) => ({ text, votes: votes.filter((v) => v.option === i).length })), total: votes.length, my_vote: myVote ? myVote.option : null };
  }
  const author = ctx.profiles.find((p) => p.slug === r.author_slug);
  return { id: r.id, kind: r.kind, title: r.title, body: r.body, image: r.image || null, poll, created_at: r.created_at,
    author: { name: r.author_name, slug: r.author_slug, avatar: author?.avatar || null },
    can_delete: Boolean(ctx.user && (r.author_id === ctx.user.id || access.can_moderate)) };
}

// ---------- Маршруты ----------

const conversationFor = (ctx, id) => {
  const c = ctx.state.conversations.find((x) => x.id === Number(id));
  if (!c || !mine(c, ctx.user.id)) fail(404, "Диалог не найден");
  return c;
};
const auth = (ctx) => { if (!ctx.user) fail(401, "Войдите, чтобы продолжить"); };

export function socialGet(route, params, ctx) {
  const { state, user } = ctx;
  if (route === "/api/me/summary") {
    auth(ctx);
    return { unread_notifications: state.notifications.filter((n) => n.user_id === user.id && !n.read).length,
      unread_messages: state.conversations.filter((c) => mine(c, user.id)).reduce((n, c) => n + unreadIn(state, c, user.id), 0) };
  }
  if (route === "/api/notifications") {
    auth(ctx);
    const items = state.notifications.filter((n) => n.user_id === user.id).sort((a, b) => b.id - a.id);
    return { unread: items.filter((n) => !n.read).length, items: items.slice(0, Number(params.get("limit")) || 30) };
  }
  if (route === "/api/conversations") {
    auth(ctx);
    const items = state.conversations.filter((c) => mine(c, user.id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id).flatMap((c) => {
      const last = state.messages.filter((m) => m.conversation_id === c.id).at(-1);
      return last ? [{ id: c.id, peer: peer(ctx, c), project: convProject(ctx, c), unread: unreadIn(state, c, user.id),
        last: { body: last.body.slice(0, 140), mine: last.sender_id === user.id, created_at: last.created_at } }] : [];
    });
    return { items };
  }
  const conv = route.match(/^\/api\/conversations\/(\d+)$/);
  if (conv) {
    auth(ctx);
    const c = conversationFor(ctx, conv[1]), after = Number(params.get("after")) || 0;
    const msgs = state.messages.filter((m) => m.conversation_id === c.id && m.id > after);
    if (msgs.length) { state.reads[`${c.id}:${user.id}`] = Math.max(state.reads[`${c.id}:${user.id}`] || 0, msgs.at(-1).id); save(state); }
    const a = state.applications.find((x) => x.conversation_id === c.id);
    const p = a && ctx.projects.find((x) => x.id === a.project_id);
    return { id: c.id, peer: peer(ctx, c), project: convProject(ctx, c),
      application: a ? { id: a.id, status: a.status, role: a.role, mine: a.user_id === user.id, can_decide: Boolean(p && a.user_id !== user.id && projectAccess(ctx, p).can_manage) } : null,
      messages: msgs.map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, mine: m.sender_id === user.id })) };
  }
  if (route === "/api/me/applications") {
    auth(ctx);
    return { items: state.applications.filter((a) => a.user_id === user.id).sort((a, b) => b.id - a.id).map((a) => {
      const p = ctx.projects.find((x) => x.id === a.project_id) || {};
      return { ...a, replied: state.messages.some((m) => m.conversation_id === a.conversation_id && m.sender_id !== user.id),
        project: { slug: p.slug, title: p.title, cover: p.cover, owner_name: p.owner_name } };
    }) };
  }
  if (route === "/api/me/settings") {
    auth(ctx);
    const profile = profileOfUser(ctx, user.id), u = state.users.find((x) => x.id === user.id);
    return { show_online: u.settings?.show_online || "all", hidden_projects: profile?.details?.hidden_projects || [],
      blog_visibility: profile?.details?.blog_visibility || "all", has_profile: Boolean(profile), account_type: u.account_type || "person",
      projects: profile ? participation(ctx, profile, true).map((p) => ({ slug: p.slug, title: p.title, closed: p.closed, founder: p.founder })) : [] };
  }
  if (route === "/api/me/org") {
    auth(ctx);
    const p = profileOfUser(ctx, user.id);
    if (!p || p.kind !== "studio") fail(404, "Сначала заполните анкету организации");
    return { slug: p.slug, name: p.name, staff: (p.details.staff || []).flatMap((m) => { const s = ctx.profiles.find((x) => x.slug === m.slug);
      return s ? [{ ...m, name: s.name, avatar: s.avatar, profile_role: s.role, verified: s.verified }] : []; }),
      staff_visibility: p.details.staff_visibility || "all", show_staff_count: p.details.show_staff_count !== false };
  }
  const apps = route.match(/^\/api\/projects\/([^/]+)\/applications$/);
  if (apps) {
    auth(ctx);
    const p = stateProject(ctx, decodeURIComponent(apps[1]));
    return { items: state.applications.filter((a) => a.project_id === p.id).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.id - a.id).map((a) => {
      const prof = profileOfUser(ctx, a.user_id), u = state.users.find((x) => x.id === a.user_id);
      return { ...a, user: { name: prof?.name || u?.name || "Пользователь", slug: prof?.status === "approved" ? prof.slug : null, avatar: prof?.avatar || null, role: prof?.role || "" } };
    }) };
  }
  if (route === "/api/posts") {
    const { access } = feedOwner(ctx, params.get("owner_type"), params.get("owner_slug"));
    const hidden = access.blog_visibility === "members" && !access.is_member;
    const items = hidden ? [] : state.posts.filter((p) => p.owner_type === params.get("owner_type") && p.owner_slug === params.get("owner_slug"))
      .sort((a, b) => b.id - a.id).map((p) => postOut(ctx, p, access));
    return { items, can_post: access.can_post, hidden, visibility: access.blog_visibility };
  }
  if (route === "/api/reports/reasons") return Object.entries(REASONS).map(([value, label]) => ({ value, label }));
  if (route === "/api/admin/reports") {
    const status = params.get("status") || "open";
    return state.reports.filter((r) => r.status === status).sort((a, b) => b.id - a.id).map((r) => {
      const u = state.users.find((x) => x.id === r.user_id);
      return { ...r, reason: REASONS[r.reason] || r.reason, url: r.target_type === "post" ? "" : pageUrl(r.target_type === "profile" ? "people" : "projects", r.target_slug),
        reporter: { name: u?.name, email: u?.email } };
    });
  }
  return undefined;
}

export function socialWrite(route, method, body, ctx) {
  const { state, user, data } = ctx;
  const commit = (result) => { save(state); return result; };

  if (route.startsWith("/api/admin/")) {
    if (!user.is_admin) fail(403, "Доступ только для администратора");
    const moderate = route.match(/^\/api\/admin\/(specialists|projects)\/([^/]+)\/moderate$/);
    if (moderate && method === "POST") {
      if (!["approve", "reject"].includes(body.action)) fail(422, "Неизвестное действие");
      if (body.action === "reject" && !String(body.note || "").trim()) fail(422, "Укажите причину отклонения — автор её увидит");
      const isProject = moderate[1] === "projects", slug = decodeURIComponent(moderate[2]);
      const item = (isProject ? state.projects : state.profiles).find((p) => p.slug === slug);
      if (!item) fail(404, "Материал не найден");
      item.status = body.action === "approve" ? "approved" : "rejected";
      item.moderation_note = item.status === "rejected" ? body.note.trim().slice(0, 500) : "";
      const what = isProject ? "Проект" : "Анкета", name = item.title || item.name, a = isProject ? "" : "а";
      notify(state, isProject ? item.author_id : item.user_id, "moderation",
        item.status === "approved" ? `${what} «${name}» опубликован${a}` : `${what} «${name}» отклонен${a}: ${item.moderation_note}`,
        pageUrl(isProject ? "projects" : "people", slug));
      if (!isProject && item.details?.draft) delete item.details.draft;
      return commit({ ok: true, status: item.status });
    }
    const report = route.match(/^\/api\/admin\/reports\/(\d+)$/);
    if (report && method === "POST") {
      if (!["resolved", "dismissed"].includes(body.status)) fail(422, "Неизвестное решение");
      const r = state.reports.find((x) => x.id === Number(report[1]));
      if (!r) fail(404, "Жалоба не найдена");
      r.status = body.status; r.resolution = String(body.note || "").trim();
      notify(state, r.user_id, "report", `Жалоба на «${r.target_title}» рассмотрена: ${body.status === "resolved" ? "приняты меры" : "нарушений не нашли"}${r.resolution ? `. ${r.resolution}` : ""}`);
      return commit({ ok: true, status: r.status });
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
      for (const [key, items] of [["freelancer", ctx.profiles.filter((p) => p.kind === "person")], ["team", ctx.profiles.filter((p) => p.kind === "studio")], ["project", ctx.projects]]) {
        if (body[key] && !items.some((p) => p.slug === body[key] && p.status === "approved")) fail(422, "Выберите опубликованный материал");
      }
      state.featured = { freelancer: body.freelancer || "", team: body.team || "", project: body.project || "" };
      return commit(state.featured);
    }
  }
  if (route === "/api/me/profile" && method === "PUT") return saveProfile(ctx, body);
  if (route === "/api/me/settings" && method === "PUT") {
    if (!["all", "contacts", "nobody"].includes(body.show_online)) fail(422, "Неизвестная настройка");
    const u = state.users.find((x) => x.id === user.id);
    u.settings = { ...(u.settings || {}), show_online: body.show_online };
    const profile = state.profiles.find((p) => p.user_id === user.id);
    if (profile) Object.assign(profile.details, { hidden_projects: [...new Set(body.hidden_projects || [])], blog_visibility: body.blog_visibility === "members" ? "members" : "all" });
    save(state);
    return socialGet("/api/me/settings", new URLSearchParams(), ctx);
  }
  if (route === "/api/me/org" && method === "PUT") {
    const p = state.profiles.find((x) => x.user_id === user.id);
    if (!p || p.kind !== "studio") fail(404, "Сначала заполните анкету организации");
    if (!["all", "selected", "hidden"].includes(body.staff_visibility)) fail(422, "Неизвестная настройка видимости");
    const before = new Set((p.details.staff || []).map((m) => m.slug)), staff = [];
    for (const m of body.staff || []) {
      const s = ctx.profiles.find((x) => x.slug === m.slug && x.status === "approved");
      if (!s || s.kind !== "person") fail(422, "Сотрудником можно добавить только опубликованную анкету специалиста");
      if (staff.some((x) => x.slug === s.slug)) continue;
      staff.push({ slug: s.slug, role: clean(m.role).slice(0, 60), can_post: Boolean(m.can_post), visible: m.visible !== false });
      if (!before.has(s.slug)) notify(state, s.user_id, "member", `Организация «${p.name}» добавила вас в сотрудники`, pageUrl("people", p.slug));
    }
    Object.assign(p.details, { staff, staff_visibility: body.staff_visibility, show_staff_count: body.show_staff_count !== false });
    save(state);
    return socialGet("/api/me/org", new URLSearchParams(), context(state, user, data));
  }
  if (route === "/api/notifications/read" && method === "POST") {
    const ids = new Set(body.ids || []);
    state.notifications.filter((n) => n.user_id === user.id && (!ids.size || ids.has(n.id))).forEach((n) => { n.read = true; });
    return commit({ ok: true });
  }
  if (route === "/api/projects" && method === "POST") return createProject(ctx, body);
  const proj = route.match(/^\/api\/projects\/([^/]+)(?:\/(team))?$/);
  if (proj && !/^\d+$/.test(proj[1])) {
    const slug = decodeURIComponent(proj[1]);
    if (proj[2] === "team" && method === "PUT") return updateTeam(ctx, slug, body);
    if (!proj[2] && method === "PUT") return updateProject(ctx, slug, body);
    if (!proj[2] && method === "DELETE") {
      const p = stateProject(ctx, slug);
      state.projects.splice(state.projects.indexOf(p), 1);
      state.posts = state.posts.filter((x) => !(x.owner_type === "project" && x.owner_slug === slug));
      return commit({ ok: true });
    }
  }
  const decision = route.match(/^\/api\/applications\/(\d+)\/decision$/);
  if (decision && method === "POST") {
    if (!["accepted", "declined"].includes(body.status)) fail(422, "Неизвестное решение");
    const a = state.applications.find((x) => x.id === Number(decision[1]));
    if (!a) fail(404, "Отклик не найден");
    const p = ctx.projects.find((x) => x.id === a.project_id);
    if (!p || !projectAccess(ctx, p).can_manage) fail(403, "Решение по отклику принимает автор проекта");
    a.status = body.status;
    const accepted = a.status === "accepted", target = state.projects.find((x) => x.id === p.id);
    if (accepted && target) {
      const prof = profileOfUser(ctx, a.user_id);
      if (prof?.status === "approved" && !target.team.some((m) => m.slug === prof.slug))
        target.team.push({ slug: prof.slug, name: prof.name, role: a.role || prof.role, avatar: prof.avatar, can_post: false, visible: true });
      target.roles = target.roles.filter((r) => r !== a.role);
    }
    const c = state.conversations.find((x) => x.id === a.conversation_id);
    if (c) addMessage(state, c, user.id, String(body.message || "").trim() || (accepted ? "Принимаю ваш отклик — рады видеть вас в команде!" : "Спасибо за отклик! Сейчас, к сожалению, не получится."));
    notify(state, a.user_id, "application_status", accepted ? `Отклик на проект «${p.title}» принят — добро пожаловать в команду!`
      : `Автор проекта «${p.title}» ответил на ваш отклик: сейчас не получится`, c ? appUrl(`messages?c=${c.id}`) : pageUrl("projects", p.slug));
    return commit({ ok: true, status: a.status });
  }
  if (route === "/api/conversations" && method === "POST") {
    const s = ctx.profiles.find((x) => x.slug === body.to_slug && x.status === "approved");
    if (!s) fail(404, "Профиль не найден");
    if (s.user_id === user.id) fail(400, "Нельзя написать самому себе");
    if (!clean(body.message)) fail(422, "Напишите сообщение");
    const c = openConversation(state, user.id, s.user_id, s.slug);
    addMessage(state, c, user.id, String(body.message).trim().slice(0, 2000));
    if (!s.user_id) demoAnswer(state, c, s.slug);
    return commit({ id: c.id });
  }
  const send = route.match(/^\/api\/conversations\/(\d+)\/messages$/);
  if (send && method === "POST") {
    const c = conversationFor(ctx, send[1]);
    if (!clean(body.body)) fail(422, "Напишите сообщение");
    const m = addMessage(state, c, user.id, String(body.body).trim().slice(0, 2000));
    if (!c.user_b && c.peer_slug) demoAnswer(state, c, c.peer_slug);
    return commit({ id: m.id, body: m.body, created_at: m.created_at, mine: true });
  }
  if (route === "/api/posts" && method === "POST") {
    if (!["profile", "project"].includes(body.owner_type) || !["post", "result", "poll"].includes(body.kind || "post")) fail(422, "Неизвестный раздел");
    const { row, title, access } = feedOwner(ctx, body.owner_type, body.owner_slug);
    if (!access.can_post) fail(403, "Публиковать здесь может владелец и те, кому он дал право публикации");
    const kind = body.kind || "post", ttl = clean(body.title).slice(0, 120), text = String(body.body || "").trim().slice(0, 4000);
    const options = (body.options || []).map(clean).filter(Boolean).slice(0, 8);
    if (kind === "poll" && ttl.length < 3) fail(422, "Сформулируйте вопрос опроса");
    if (kind === "poll" && options.length < 2) fail(422, "В опросе нужно хотя бы два варианта ответа");
    if (kind !== "poll" && text.length < 3 && !body.image_data) fail(422, "Напишите текст записи или добавьте картинку");
    const prof = profileOfUser(ctx, user.id);
    const post = { id: nextId(state), owner_type: body.owner_type, owner_slug: body.owner_slug, author_id: user.id,
      author_name: prof?.name || user.name, author_slug: prof?.status === "approved" ? prof.slug : null, kind, title: ttl, body: text,
      image: kind === "poll" ? "" : body.image_data || "", poll: kind === "poll" ? options : [], created_at: now() };
    state.posts.push(post);
    if (body.owner_type === "project") new Set([...memberUsers(ctx, row.team || []), row.author_id].filter((id) => id && id !== user.id))
      .forEach((id) => notify(state, id, "post", `Новая запись в ленте проекта «${title}»`, pageUrl("projects", row.slug, "#feed")));
    return commit(postOut(ctx, post, access));
  }
  const postAction = route.match(/^\/api\/posts\/(\d+)(?:\/(vote))?$/);
  if (postAction) {
    const post = state.posts.find((p) => p.id === Number(postAction[1]));
    if (!post) fail(404, "Запись не найдена");
    const { access } = feedOwner(ctx, post.owner_type, post.owner_slug);
    if (postAction[2] === "vote" && method === "POST") {
      if (post.kind !== "poll") fail(404, "Опрос не найден");
      if (access.blog_visibility === "members" && !access.is_member) fail(403, "Голосовать могут только участники");
      const option = Number(body.option);
      if (!(option >= 0 && option < post.poll.length)) fail(422, "Нет такого варианта");
      state.votes = state.votes.filter((v) => !(v.post_id === post.id && v.user_id === user.id));
      state.votes.push({ post_id: post.id, user_id: user.id, option });
      return commit(postOut(ctx, post, access));
    }
    if (!postAction[2] && method === "DELETE") {
      if (post.author_id !== user.id && !access.can_moderate) fail(403, "Удалить запись может автор или владелец раздела");
      state.posts.splice(state.posts.indexOf(post), 1);
      return commit({ ok: true });
    }
  }
  if (route === "/api/reports" && method === "POST") {
    if (!["profile", "project", "post"].includes(body.target_type) || !REASONS[body.reason]) fail(422, "Выберите причину");
    if (body.reason === "other" && clean(body.comment).length < 5) fail(422, "Опишите, что не так, — хотя бы пару слов");
    const slug = String(body.target_slug);
    const target = body.target_type === "profile" ? ctx.profiles.find((p) => p.slug === slug)
      : body.target_type === "project" ? ctx.projects.find((p) => p.slug === slug) : state.posts.find((p) => p.id === Number(slug));
    if (!target) fail(404, "Материал не найден");
    if ((target.user_id || target.author_id) === user.id) fail(400, "Нельзя пожаловаться на свой материал");
    if (state.reports.some((r) => r.user_id === user.id && r.target_type === body.target_type && r.target_slug === slug && r.status === "open"))
      fail(409, "Вы уже отправили жалобу — модератор её рассмотрит");
    state.reports.push({ id: nextId(state), user_id: user.id, target_type: body.target_type, target_slug: slug,
      target_title: target.title || target.name || String(target.body || "").slice(0, 60), reason: body.reason,
      comment: String(body.comment || "").trim().slice(0, 1000), status: "open", resolution: "", created_at: now() });
    return commit({ ok: true });
  }
  const action = route.match(/^\/api\/(projects|specialists)\/([^/]+)\/(like|apply|bookmark|invite)$/);
  if (action && method === "POST") {
    const [, type, value, operation] = action;
    const items = type === "projects" ? ctx.projects : ctx.profiles;
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
      if (owns(ctx, item)) fail(400, "Это ваш проект — откликаться на него не нужно");
      if (item.closed) fail(400, "Проект завершён и не принимает отклики");
      if (state.applications.some((a) => a.user_id === user.id && a.project_id === item.id)) fail(409, "Вы уже откликнулись на этот проект");
      const authorId = item.author_id || ctx.flags[item.owner_slug]?.user_id || null;
      const c = openConversation(state, user.id, authorId, item.owner_slug, item.id);
      const role = clean(body.role);
      addMessage(state, c, user.id, (role ? `Отклик на роль «${role}»\n\n` : "Отклик на проект\n\n") + body.message.trim());
      if (!authorId) demoAnswer(state, c, item.owner_slug || item.slug);
      state.applications.push({ id: nextId(state), user_id: user.id, project_id: item.id, role, message: body.message.trim(), status: "pending", conversation_id: c.id, created_at: now() });
      notify(state, authorId, "application", `${user.name} откликается на проект «${item.title}»${role ? ` — ${role}` : ""}`, pageUrl("projects", item.slug, "#applications"));
      return commit({ ok: true, project: item.title, conversation_id: c.id });
    }
    if (item.user_id === user.id) fail(400, "Это ваша анкета");
    let project = null;
    if (body.project_slug) {
      project = ctx.projects.find((p) => p.slug === body.project_slug);
      if (!project || project.author_id !== user.id) fail(422, "Пригласить можно только в свой проект");
    }
    state.invitations.push({ user_id: user.id, slug: item.slug, message: body.message });
    const c = openConversation(state, user.id, item.user_id, item.slug);
    addMessage(state, c, user.id, (project ? `Приглашение в проект «${project.title}»: ${pageUrl("projects", project.slug)}\n\n` : "") + body.message.trim());
    if (!item.user_id) demoAnswer(state, c, item.slug);
    else if (project) notify(state, item.user_id, "invite", `${user.name} приглашает вас в проект «${project.title}»`, appUrl(`messages?c=${c.id}`));
    return commit({ ok: true, to: item.name, conversation_id: c.id });
  }
  return undefined;
}

