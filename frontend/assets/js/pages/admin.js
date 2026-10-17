/** Moderation, homepage picks and user roles. Shared by server and Pages demo. */
import { api, get, post } from "../core/api.js";
import { $, $$, esc } from "../core/dom.js";
import { currentUser, requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { personUrl, projectUrl, statusBadge } from "../components/cards.js";

export async function init() {
  const root = $("#admin");
  if (!(await requireAuth())) return;
  if (!currentUser().is_admin) {
    root.innerHTML = `<div class="empty-state"><strong>Доступ только для администратора</strong><p>Ваш аккаунт может создавать проекты и анкету специалиста.</p><a class="btn btn--primary" href="/me">Личный кабинет</a></div>`;
    return;
  }
  root.innerHTML = `<section class="cabinet-head"><div><p class="eyebrow">Управление платформой</p><h1 class="title-lg">Админ-панель</h1>
    <p class="lead">Проверяйте анкеты и проекты, выбирайте героев главной и управляйте ролями.</p></div><a class="btn btn--outline" href="/me">Мой кабинет</a></section>
    <div class="admin-stats" data-admin-stats aria-live="polite"></div>
    <nav class="admin-tabs" aria-label="Разделы админ-панели">
      <button class="btn btn--primary" data-tab="moderation" aria-pressed="true">Модерация</button>
      <button class="btn btn--outline" data-tab="featured" aria-pressed="false">Главная страница</button>
      <button class="btn btn--outline" data-tab="users" aria-pressed="false">Пользователи</button>
    </nav><section data-admin-panel aria-live="polite"></section>`;
  let tab = "moderation", status = "pending", revision = 0;
  const panel = $("[data-admin-panel]", root);

  async function stats() {
    const s = await get("/api/admin/stats");
    $("[data-admin-stats]", root).innerHTML = [[s.users, "Пользователей"], [s.specialists, "Специалистов"], [s.projects, "Проектов"],
      [s.pending_specialists + s.pending_projects, "Ждут проверки"], [s.applications, "Откликов"], [s.invitations, "Сообщений"]]
      .map(([n, label]) => `<div class="card card--pad"><strong>${n}</strong><span>${label}</span></div>`).join("");
  }
  async function render() {
    const request = ++revision;
    panel.innerHTML = '<p class="muted">Загрузка…</p>';
    try {
      let html;
      if (tab === "moderation") {
        const queue = await get("/api/admin/moderation?status=" + status);
        const item = (p, type) => `<article class="card card--pad moderation-item" data-kind="${type}" data-slug="${esc(p.slug)}">
          <div class="row"><span class="eyebrow">${type === "projects" ? "Проект" : "Анкета"}</span>${statusBadge(p.status)}</div>
          <h3 class="title-sm">${esc(p.title || p.name)}</h3><p>${esc(p.description || p.details?.bio || p.about)}</p>
          <p class="muted">${esc(p.submitter?.name)} · ${esc(p.submitter?.email)}</p>
          ${p.moderation_note ? `<div class="notice notice--warn">${esc(p.moderation_note)}</div>` : ""}
          <a class="link" href="${type === "projects" ? projectUrl(p) : personUrl(p.slug)}">Открыть материал ↗</a>
          <label class="field"><span class="field__label">Комментарий автору при отклонении</span><textarea class="input" data-note maxlength="500" placeholder="Что нужно исправить?"></textarea></label>
          <div class="form-error" role="alert"></div><div class="row">
            ${p.status !== "approved" ? '<button class="btn btn--primary" data-moderate="approve">Одобрить</button>' : ""}
            ${p.status !== "rejected" ? '<button class="btn btn--outline" data-moderate="reject">Отклонить</button>' : ""}</div></article>`;
        html = `<div class="row admin-status" aria-label="Статус материалов">${[["pending", "На проверке"], ["approved", "Опубликованные"], ["rejected", "Отклонённые"]]
          .map(([key, label]) => `<button class="btn btn--sm ${status === key ? "btn--primary" : "btn--outline"}" data-status="${key}" aria-pressed="${status === key}">${label}</button>`).join("")}</div>
          <div class="admin-queue">${queue.specialists.map((p) => item(p, "specialists")).join("")}${queue.projects.map((p) => item(p, "projects")).join("")}
          ${!queue.specialists.length && !queue.projects.length ? '<div class="empty-state"><strong>Здесь пока пусто</strong><p>Материалы с этим статусом появятся здесь.</p></div>' : ""}</div>`;
      } else if (tab === "featured") {
        const [chosen, people, projects] = await Promise.all([get("/api/admin/featured"), get("/api/specialists"), get("/api/projects?limit=50")]);
        const select = (key, title, items) => `<label class="field"><span class="field__label">${title}</span><select class="select" name="${key}">
          <option value="">Автоматический выбор</option>${items.map((p) => `<option value="${esc(p.slug)}" ${chosen[key] === p.slug ? "selected" : ""}>${esc(p.name || p.title)}</option>`).join("")}</select></label>`;
        html = `<form class="card card--pad admin-featured" data-featured><h2 class="title">Герои главной страницы</h2><p class="muted">Выберите опубликованные материалы для блока открытий.</p>
          ${select("freelancer", "Специалист", people.items.filter((p) => p.kind === "person"))}
          ${select("team", "Студия / команда", people.items.filter((p) => p.kind === "studio"))}
          ${select("project", "Проект", projects.items)}<div class="form-error" role="alert"></div>
          <div class="row" style="margin-top:1.5rem"><button class="btn btn--primary" type="submit">Сохранить выбор</button><a class="link" href="/">Посмотреть главную ↗</a></div></form>`;
      } else {
        const users = await get("/api/admin/users");
        html = `<h2 class="title">Пользователи · ${users.length}</h2><div class="admin-users">${users.map((u) => `<article class="card card--pad admin-user">
          <div><h3 class="title-sm">${esc(u.name)}</h3><p class="muted">${esc(u.email)}</p><small>Проектов: ${u.projects}${u.profile_status ? " · Анкета: " : ""}</small>${u.profile_status ? statusBadge(u.profile_status) : ""}</div>
          <div class="stack"><span class="badge ${u.is_admin ? "badge--purple" : "badge--green"}">${u.is_admin ? "Администратор" : "Пользователь"}</span>
          ${u.id === currentUser().id ? '<small class="muted">Ваш аккаунт</small>' : `<button class="btn btn--sm btn--outline" data-user-id="${u.id}" data-admin="${!u.is_admin}">${u.is_admin ? "Снять права" : "Назначить администратором"}</button>`}</div></article>`).join("")}</div>`;
      }
      if (request === revision) panel.innerHTML = html;
    } catch (error) { if (request === revision) { panel.innerHTML = '<div class="form-error" role="alert"></div>'; $(".form-error", panel).textContent = error.message; } }
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.tab) {
      tab = button.dataset.tab;
      $$("[data-tab]", root).forEach((b) => { const active = b === button; b.classList.toggle("btn--primary", active); b.classList.toggle("btn--outline", !active); b.setAttribute("aria-pressed", active); });
      await render(); return;
    }
    if (button.dataset.status) { status = button.dataset.status; await render(); return; }
    if (button.dataset.moderate) {
      const card = button.closest("[data-slug]"), error = $(".form-error", card), note = $("[data-note]", card).value.trim();
      error.textContent = "";
      if (button.dataset.moderate === "reject" && !note) { error.textContent = "Укажите причину отклонения — автор её увидит"; $("[data-note]", card).focus(); return; }
      $$("button", card).forEach((b) => { b.disabled = true; });
      try {
        await post(`/api/admin/${card.dataset.kind}/${encodeURIComponent(card.dataset.slug)}/moderate`, { action: button.dataset.moderate, note });
        toast(button.dataset.moderate === "approve" ? "Материал опубликован" : "Материал отклонён", "ok");
        await Promise.all([stats(), render()]);
      } catch (e) { error.textContent = e.message; $$("button", card).forEach((b) => { b.disabled = false; }); }
    }
    if (button.dataset.userId) {
      button.disabled = true;
      try { await post(`/api/admin/users/${button.dataset.userId}/admin`, { is_admin: button.dataset.admin === "true" }); toast("Роль обновлена", "ok"); await render(); }
      catch (error) { toast(error.message, "err"); button.disabled = false; }
    }
  });
  root.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-featured]")) return;
    event.preventDefault();
    const form = event.target, button = $("button[type=submit]", form), error = $(".form-error", form);
    button.disabled = true; error.textContent = "";
    try { await api("/api/admin/featured", { method: "PUT", body: Object.fromEntries(new FormData(form)) }); toast("Главная страница обновлена", "ok"); }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  await Promise.all([stats(), render()]);
}
