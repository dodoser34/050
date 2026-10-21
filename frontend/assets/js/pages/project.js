/** Страница проекта: обложка, навигация по разделам, описание, этап, открытые роли, команда, лента проекта
 *  (результаты, новости, опросы), дорожная карта, обновления, автор и условия, похожие проекты.
 *  Автору — управление: редактирование, состав команды и права участников, отклики, удаление. */
import { api, get, post } from "../core/api.js";
import { $, $$, capFirst, debounce, esc, seeking, slugFromPath, timeAgo } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { currentUser } from "../core/session.js";
import { toast } from "../core/toast.js";
import { applicationBadge, likeButton, moderationNotice, nameMarks, personUrl, presenceLabel, projectCard } from "../components/cards.js";
import { openApply, openProjectForm } from "../components/actions.js";
import { mountFeed } from "../components/feed.js";
import { confirmDialog, openModal } from "../components/modal.js";
import { observeReveal } from "../components/reveal.js";

const STAGE_HINTS = {
  "Идея": "Формулируем задачу",
  "В разработке": "Собираем и делаем",
  "Бета": "Тестируем с первыми людьми",
  "Запущен": "Работает и развивается",
};
const ROADMAP_STATUS = { done: "Готово", current: "Сейчас", next: "Впереди" };

let p, root;

export async function init() {
  root = $("#project");
  try { p = await get("/api/projects/" + encodeURIComponent(slugFromPath())); }
  catch {
    root.innerHTML = `<div class="empty-state" style="margin-top:3rem"><strong>Проект не найден</strong><a class="link link--orange" href="/projects">Вернуться к проектам</a></div>`;
    return;
  }
  draw();

  root.addEventListener("click", async (e) => {
    const applyBtn = e.target.closest("[data-apply]");
    if (applyBtn) { e.preventDefault(); openApply(p.slug, p.title, p.roles, applyBtn.dataset.apply); }
    if (e.target.closest("[data-share]")) {
      try { await navigator.clipboard.writeText(location.href); toast("Ссылка скопирована"); }
      catch { toast("Скопируйте ссылку из адресной строки"); }
    }
    if (e.target.closest("[data-edit]")) openProjectForm(p);
    if (e.target.closest("[data-team]")) openTeamEditor();
    if (e.target.closest("[data-delete]")) deleteProject();
    const decide = e.target.closest("[data-decide]");
    if (decide) decideApplication(decide);
  });
  document.addEventListener("project:applied", async () => { p = await get("/api/projects/" + encodeURIComponent(p.slug)); draw(); });
  document.addEventListener("project:updated", (e) => { p = e.detail; draw(); });
}

function draw() {
  document.title = `${p.title} — Среда`;
  root.innerHTML = render(p);
  observeReveal(root);
  initSectionNav(root);
  mountFeed($("#feed-box", root), "project", p.slug, { emptyText: "В ленте пока пусто. Здесь участники публикуют результаты работы, новости и опросы." });
  if (p.can_manage) loadApplications();
  if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 50);
}

/** Подсветка текущего раздела в навигации при прокрутке. */
function initSectionNav(rootEl) {
  const links = $$(".section-nav a", rootEl);
  const sections = links.map((a) => $(a.getAttribute("href"), rootEl)).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${e.target.id}`));
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((s) => io.observe(s));
}

function applyButton(proj, role = "", cls = "btn--primary") {
  if (proj.is_author || proj.status !== "approved") return "";
  if (proj.application) {
    return `<a class="btn ${cls.includes("sm") ? "btn--sm " : ""}btn--white" href="/messages?c=${proj.application.conversation_id}">${icon("check")}Отклик: ${esc({ pending: "ждёт ответа", accepted: "принят", declined: "отклонён" }[proj.application.status] || "отправлен")}</a>`;
  }
  if (proj.closed) return "";
  return `<button class="btn ${cls}" data-apply="${esc(role)}">${icon("send")}Откликнуться</button>`;
}

function render(proj) {
  const d = proj.details || {};
  const stageIndex = proj.stages.indexOf(proj.stage);
  const teamLabel = proj.team.length || proj.team_count ? ` · ${proj.team_count ?? proj.team.length}` : "";
  const nav = [
    ["overview", "Обзор"],
    ["feed", "Лента"],
    ["roles", `Роли${proj.roles.length && !proj.closed ? ` · ${proj.roles.length}` : ""}`],
    ["team", `Команда${teamLabel}`],
    proj.can_manage && ["applications", `Отклики${proj.pending_applications ? ` · ${proj.pending_applications}` : ""}`],
    d.roadmap?.length && ["roadmap", "Дорожная карта"],
    d.updates?.length && ["updates", "Обновления"],
  ].filter(Boolean);
  const user = currentUser();

  return `
    <nav class="breadcrumbs" aria-label="Навигация"><a href="/">Главная</a><span>/</span><a href="/projects">Проекты</a><span>/</span><a href="/projects?tag=${encodeURIComponent(proj.category)}">${esc(proj.category)}</a></nav>

    ${moderationNotice(proj.status, proj.moderation_note, "проект")}
    ${proj.can_manage ? `
    <div class="manage" role="group" aria-label="Управление проектом">
      <span class="manage__label">${proj.is_author ? "Ваш проект" : "Управление"}</span>
      <button class="btn btn--sm btn--outline" data-edit>${icon("edit", "sm")}Редактировать</button>
      <button class="btn btn--sm btn--outline" data-team>${icon("users", "sm")}Команда и права</button>
      <a class="btn btn--sm btn--outline" href="#applications">${icon("send", "sm")}Отклики${proj.pending_applications ? ` <span class="count-badge" style="position:static;box-shadow:none" data-n="${proj.pending_applications}">${proj.pending_applications}</span>` : ""}</a>
      <button class="btn btn--sm btn--ghost-danger" data-delete>${icon("trash", "sm")}Удалить</button>
    </div>` : ""}

    <section class="project-cover">
      ${imgTag(proj.cover, "cover", proj.title, 'loading="eager"')}
      <div class="project-cover__content">
        <div>
          <div class="project-cover__badges">
            <span class="badge badge--glass">${esc(proj.category)}</span>
            <span class="badge badge--glass">${esc(proj.stage)}</span>
            ${proj.closed ? '<span class="badge badge--dark">Проект завершён</span>' : ""}
            ${proj.beta ? '<span class="badge badge--glass">Бета доступна</span>' : ""}
            ${proj.is_author ? '<span class="badge badge--glass">Это ваш проект</span>' : ""}
          </div>
          <h1 class="project-cover__title split-words">${esc(proj.title)}</h1>
          <p class="project-cover__pitch">${esc(proj.description)}</p>
        </div>
        <div class="project-cover__actions">
          ${proj.status === "approved" ? likeButton(proj) : ""}
          <button class="btn btn--white" data-share>${icon("link")}Поделиться</button>
          ${applyButton(proj)}
          ${user && !proj.can_manage ? `<button class="btn btn--white" data-action="report" data-type="project" data-slug="${esc(proj.slug)}" data-title="${esc(proj.title)}" aria-label="Пожаловаться на проект" title="Пожаловаться">${icon("flag")}</button>` : ""}
        </div>
      </div>
    </section>

    <nav class="section-nav" aria-label="Разделы проекта">
      ${nav.map(([id, label], i) => `<a href="#${id}" class="${i ? "" : "is-active"}">${label}</a>`).join("")}
    </nav>

    <div class="project-layout">
      <div>
        <section id="overview" class="project-block project-block--first">
          <h2 class="project-block__title" data-reveal>О проекте</h2>
          ${d.about?.length
            ? `<div class="project-about" data-reveal>${d.about.map((t) => `<p>${esc(t)}</p>`).join("")}</div>`
            : `<p class="project-desc" data-reveal>${esc(proj.description)}</p>${proj.can_manage ? '<p class="muted" style="margin-top:1rem">Добавьте подробное описание — кнопка «Редактировать» выше.</p>' : ""}`}

          ${d.problem || d.solution ? `
          <div class="ps-grid">
            ${d.problem ? `<article class="ps-card ps-card--problem" data-reveal><span class="ps-card__label">${icon("compass")}Проблема</span><p>${esc(d.problem)}</p></article>` : ""}
            ${d.solution ? `<article class="ps-card ps-card--solution" data-reveal style="--d:.1s"><span class="ps-card__label">${icon("bulb")}Решение</span><p>${esc(d.solution)}</p></article>` : ""}
          </div>` : ""}

          ${d.goals?.length ? `
          <h3 class="project-block__subtitle" data-reveal>Цели</h3>
          <ul class="goals">${d.goals.map((g, i) => `<li data-reveal style="--d:${i * 0.06}s"><span class="goals__check">${icon("check")}</span>${esc(g)}</li>`).join("")}</ul>` : ""}

          <h3 class="project-block__subtitle" data-reveal>Этап проекта</h3>
          <div class="stages" data-reveal>
            ${proj.stages.map((s, i) => `
              <div class="stage-step ${i < stageIndex ? "is-done" : i === stageIndex ? "is-current" : ""}" style="--d:${i * 0.15}s">
                <div class="stage-step__bar"></div><strong>${esc(s)}</strong><small>${esc(STAGE_HINTS[s] || "")}</small>
              </div>`).join("")}
          </div>
        </section>

        <section id="feed" class="project-block">
          <h2 class="project-block__title">Лента проекта</h2>
          ${proj.blog_visibility === "members" && proj.is_member ? `<p class="muted" style="margin:-.5rem 0 1rem">${icon("lock", "sm")} Ленту видят только участники.</p>` : ""}
          <div id="feed-box"><div class="skeleton" style="min-height:8rem"></div></div>
        </section>

        <section id="roles" class="project-block">
          <h2 class="project-block__title" data-reveal>Открытые роли</h2>
          ${proj.closed ? '<p class="muted" data-reveal>Проект завершён и больше не набирает участников.</p>'
            : proj.roles.length ? `<div class="roles">${proj.roles.map((r, i) => `
            <article class="card role-card is-hoverable" data-reveal style="--d:${i * 0.06}s">
              <div class="role-card__head">
                <div><div class="role-card__title">${esc(r)}</div><small>${esc(capFirst(seeking(r)))} в команду</small></div>
                ${proj.application ? "" : applyButton(proj, r, "btn--sm btn--outline-orange")}
              </div>
              ${d.role_details?.[r] ? `<p class="role-card__text">${esc(d.role_details[r])}</p>` : ""}
            </article>`).join("")}</div>`
            : '<p class="muted" data-reveal>Команда сейчас укомплектована, но вы можете предложить помощь — автор увидит отклик.</p>'}
        </section>

        <section id="team" class="project-block">
          <h2 class="project-block__title" data-reveal>Команда</h2>
          ${teamHtml(proj)}
        </section>

        ${proj.can_manage ? `
        <section id="applications" class="project-block">
          <h2 class="project-block__title">Отклики</h2>
          <div class="stack" style="--gap:.75rem" data-applications><div class="skeleton" style="min-height:6rem"></div></div>
        </section>` : ""}

        ${d.roadmap?.length ? `
        <section id="roadmap" class="project-block">
          <h2 class="project-block__title" data-reveal>Дорожная карта</h2>
          <ol class="roadmap">${d.roadmap.map((s, i) => `
            <li class="roadmap__item roadmap__item--${s.status}" data-reveal style="--d:${i * 0.08}s">
              <span class="roadmap__dot">${s.status === "done" ? icon("check") : ""}</span>
              <div class="roadmap__body"><strong>${esc(s.title)}</strong><small>${esc(s.period)} · ${ROADMAP_STATUS[s.status] || ""}</small></div>
            </li>`).join("")}</ol>
        </section>` : ""}

        ${d.updates?.length ? `
        <section id="updates" class="project-block">
          <h2 class="project-block__title" data-reveal>Обновления</h2>
          <div class="updates">${d.updates.map((u, i) => `
            <article class="card update" data-reveal style="--d:${i * 0.08}s">
              <time class="update__date">${esc(u.date)}</time>
              <div><h3 class="update__title">${esc(u.title)}</h3><p>${esc(u.text)}</p></div>
            </article>`).join("")}</div>
        </section>` : ""}
      </div>

      <aside class="project-aside">
        ${proj.owner ? `
        <a class="card card--pad is-hoverable owner-card" href="${personUrl(proj.owner.slug)}" data-reveal="right">
          ${imgTag(proj.owner.avatar, "avatar", proj.owner.name, proj.owner.kind === "studio" ? 'class="is-org"' : "")}
          <div><small class="muted">${proj.owner.kind === "studio" ? "Организация-основатель" : "Основатель проекта"}</small>
            <div class="title-sm owner-card__name">${esc(proj.owner.name)}${nameMarks(proj.owner)}</div>
            <small class="muted">${esc(proj.owner.role)}</small>${proj.owner.presence ? `<div>${presenceLabel(proj.owner.presence)}</div>` : ""}</div>
        </a>` : `
        <div class="card card--pad owner-card" data-reveal="right">
          ${imgTag("", "avatar", proj.owner_name)}
          <div><small class="muted">Основатель проекта</small><div class="title-sm">${esc(proj.owner_name)}</div></div>
        </div>`}
        <div class="card card--pad" data-reveal="right" style="--d:.08s">
          <div class="facts">
            <div class="fact"><span>Направление</span><span>${esc(proj.category)}</span></div>
            <div class="fact"><span>Стадия</span><span>${esc(proj.stage)}${proj.closed ? " · завершён" : ""}</span></div>
            <div class="fact"><span>Лицензия</span><span>${esc(proj.license)}</span></div>
            <div class="fact"><span>Бета-версия</span><span>${proj.beta ? "Есть" : "Нет"}</span></div>
            ${proj.team_count != null ? `<div class="fact"><span>Участников</span><span>${proj.team_count}</span></div>` : ""}
            <div class="fact"><span>Открытых ролей</span><span>${proj.closed ? 0 : proj.roles.length}</span></div>
          </div>
          ${proj.is_author ? "" : `<div class="aside-cta">${applyButton(proj, "", "btn--primary btn--block")}</div>`}
        </div>
        ${d.conditions ? `
        <div class="card card--pad" data-reveal="right" style="--d:.16s">
          <h3 class="aside-title">Условия участия</h3>
          <p class="muted">${esc(d.conditions)}</p>
        </div>` : ""}
        ${d.links?.length ? `
        <div class="card card--pad" data-reveal="right" style="--d:.24s">
          <h3 class="aside-title">Ссылки</h3>
          <div class="link-list">${d.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${icon("link", "sm")}<span>${esc(l.label)}</span>${icon("arrow-up-right", "sm")}</a>`).join("")}</div>
        </div>` : ""}
      </aside>
    </div>

    ${proj.related.length ? `
    <section class="section">
      <div class="section__head"><h2 class="title-lg split-words">Похожие проекты</h2><a class="btn btn--outline" href="/projects">Все проекты ${icon("arrow-right", "sm")}</a></div>
      <div class="grid-cards">${proj.related.map((r, i) => projectCard(r, { delay: i * 0.08 })).join("")}</div>
    </section>` : ""}`;
}

function teamHtml(proj) {
  const hiddenNote = proj.team_visibility !== "all" && !proj.is_member
    ? `<p class="muted" style="margin-bottom:1rem">${icon("lock", "sm")} ${proj.team_visibility === "hidden" ? "Команда скрыта" : "Показаны не все участники"}${proj.team_count != null ? ` · всего ${proj.team_count}` : ""}.</p>` : "";
  if (!proj.team.length) return hiddenNote || '<p class="muted" data-reveal>Команда только собирается — станьте первым участником.</p>';
  return `${hiddenNote}<div class="team">${proj.team.map((m, i) => `
    <a class="card team-card is-hoverable" href="${personUrl(m.slug)}" data-reveal style="--d:${i * 0.05}s">
      ${imgTag(m.avatar, "avatar", m.name)}
      <div><div class="team-card__name">${esc(m.name)}${nameMarks(m)}</div><small>${esc(m.role)}</small>
        ${proj.is_member && (m.can_post || m.visible === false) ? `<div class="list-card__badges">${m.can_post ? '<span class="badge badge--purple">Публикует в ленте</span>' : ""}${m.visible === false ? '<span class="badge badge--muted">Скрыт</span>' : ""}</div>` : ""}</div>
    </a>`).join("")}</div>`;
}

async function loadApplications() {
  const box = $("[data-applications]", root);
  try {
    const { items } = await get(`/api/projects/${encodeURIComponent(p.slug)}/applications`);
    box.innerHTML = items.length ? items.map((a) => `
      <article class="card applicant">
        ${imgTag(a.user.avatar, "avatar", a.user.name)}
        <div>
          <div class="applicant__top">${a.user.slug ? `<a class="u-hover" href="${personUrl(a.user.slug)}"><strong>${esc(a.user.name)}</strong></a>` : `<strong>${esc(a.user.name)}</strong>`}
            ${applicationBadge(a.status)}<small class="muted">${esc(timeAgo(a.created_at))}</small></div>
          <small class="muted">${a.role ? `На роль «${esc(a.role)}»` : "На любую роль"}${a.user.role ? ` · ${esc(a.user.role)}` : ""}</small>
          <p>${esc(a.message)}</p>
          <div class="applicant__actions">
            ${a.status === "pending" ? `<button class="btn btn--sm btn--primary" data-decide="accepted" data-id="${a.id}">${icon("check", "sm")}Принять</button>
              <button class="btn btn--sm btn--outline" data-decide="declined" data-id="${a.id}">Отклонить</button>` : ""}
            ${a.conversation_id ? `<a class="btn btn--sm btn--ghost" href="/messages?c=${a.conversation_id}">${icon("chat", "sm")}Переписка</a>` : ""}
            ${!a.user.slug && a.status === "pending" ? '<small class="muted">Без опубликованной анкеты участник не появится в составе команды.</small>' : ""}
          </div>
        </div>
      </article>`).join("") : '<div class="empty-state">Откликов пока нет. Они появятся здесь и в сообщениях.</div>';
  } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}

async function decideApplication(btn) {
  const accepted = btn.dataset.decide === "accepted";
  if (!(await confirmDialog(accepted ? "Принять отклик?" : "Отклонить отклик?",
    accepted ? "Участник с анкетой попадёт в команду, а его роль уберётся из открытых." : "Автор отклика получит уведомление.",
    { ok: accepted ? "Принять" : "Отклонить", danger: !accepted }))) return;
  try {
    await post(`/api/applications/${btn.dataset.id}/decision`, { status: btn.dataset.decide });
    toast(accepted ? "Отклик принят" : "Отклик отклонён", "ok");
    p = await get("/api/projects/" + encodeURIComponent(p.slug));
    draw();
    document.querySelector("#applications")?.scrollIntoView();
  } catch (err) { toast(err.message, "err"); }
}

async function deleteProject() {
  if (!(await confirmDialog(`Удалить проект «${p.title}»?`, "Проект, его лента и отклики исчезнут без возможности восстановления.", { ok: "Удалить", danger: true }))) return;
  try {
    await api(`/api/projects/${encodeURIComponent(p.slug)}`, { method: "DELETE" });
    toast("Проект удалён", "ok");
    setTimeout(() => (location.href = "/projects?mine=true"), 600);
  } catch (err) { toast(err.message, "err"); }
}

const memberRow = (m) => `
  <div class="member-row" data-member="${esc(m.slug)}">
    ${imgTag(m.avatar, "avatar", m.name)}
    <div class="member-row__main">
      <strong>${esc(m.name)}</strong>
      <input class="input" data-role value="${esc(m.role || "")}" placeholder="Роль в проекте" maxlength="60" aria-label="Роль ${esc(m.name)}">
      <div class="member-row__flags">
        <label class="check check--sm"><input type="checkbox" data-can-post ${m.can_post ? "checked" : ""}>Публикует в ленте</label>
        <label class="check check--sm"><input type="checkbox" data-visible ${m.visible !== false ? "checked" : ""}>Виден посетителям</label>
      </div>
    </div>
    <button type="button" class="icon-btn" data-remove aria-label="Убрать из команды">${icon("x", "sm")}</button>
  </div>`;

/** Поиск анкеты специалиста для добавления в команду / в сотрудники. */
export function memberSearch(box, onPick) {
  const input = $("input", box), results = $(".member-search__results", box);
  input.addEventListener("input", debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { results.hidden = true; return; }
    const r = await get(`/api/search?q=${encodeURIComponent(q)}`).catch(() => ({ people: [] }));
    results.innerHTML = r.people.length ? r.people.map((s) => `<button type="button" class="member-search__item" data-pick="${esc(s.slug)}">
      ${imgTag(s.avatar, "avatar", s.name)}<span>${esc(s.name)}<small>${esc(s.role)}</small></span></button>`).join("") : '<div class="chat__empty">Никого не нашли</div>';
    results.hidden = false;
    results._people = r.people;
  }));
  results.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    onPick(results._people.find((s) => s.slug === b.dataset.pick));
    input.value = ""; results.hidden = true;
  });
}

function openTeamEditor() {
  const m = openModal(`
    <h2 class="modal__title">Команда и права</h2>
    <p class="modal__sub">Решите, кто публикует в ленте проекта и кого видят посетители. Общая видимость команды — в «Редактировать».</p>
    <form novalidate>
      <div data-members>${p.team.map(memberRow).join("") || '<p class="muted" data-empty>В команде пока никого.</p>'}</div>
      <div class="member-search"><input class="input" placeholder="Добавить участника: имя или навык" aria-label="Найти специалиста">
        <div class="member-search__results" hidden></div></div>
      <div class="form-error"></div>
      <div class="modal__actions"><button type="button" class="btn btn--outline" data-cancel>Отмена</button><button type="submit" class="btn btn--primary">Сохранить</button></div>
    </form>`);
  const form = $("form", m.el), list = $("[data-members]", form);
  $("[data-cancel]", form).addEventListener("click", m.close);
  list.addEventListener("click", (e) => e.target.closest("[data-remove]")?.closest(".member-row").remove());
  memberSearch($(".member-search", form), (s) => {
    if ($(`[data-member="${CSS.escape(s.slug)}"]`, list)) return;
    $("[data-empty]", list)?.remove();
    list.insertAdjacentHTML("beforeend", memberRow({ ...s, role: s.role, visible: true }));
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const members = $$(".member-row", list).map((r) => ({ slug: r.dataset.member, role: $("[data-role]", r).value,
      can_post: $("[data-can-post]", r).checked, visible: $("[data-visible]", r).checked }));
    try {
      p = await api(`/api/projects/${encodeURIComponent(p.slug)}/team`, { method: "PUT", body: { members } });
      m.close(); toast("Команда обновлена", "ok"); draw();
    } catch (err) { $(".form-error", form).textContent = err.message; }
  });
}
