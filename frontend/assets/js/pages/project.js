/** Страница проекта: обложка, навигация по разделам, описание, проблема и решение, цели, этап,
 *  открытые роли, команда, дорожная карта, обновления, автор и условия, похожие проекты. */
import { get } from "../core/api.js";
import { $, $$, capFirst, esc, seeking, slugFromPath } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { toast } from "../core/toast.js";
import { likeButton, moderationNotice, personUrl, projectCard, verifiedMark } from "../components/cards.js";
import { openApply } from "../components/actions.js";
import { observeReveal } from "../components/reveal.js";

const STAGE_HINTS = {
  "Идея": "Формулируем задачу",
  "В разработке": "Собираем и делаем",
  "Бета": "Тестируем с первыми людьми",
  "Запущен": "Работает и развивается",
};
const ROADMAP_STATUS = { done: "Готово", current: "Сейчас", next: "Впереди" };

export async function init() {
  const root = $("#project");
  let p;
  try { p = await get("/api/projects/" + encodeURIComponent(slugFromPath())); }
  catch {
    root.innerHTML = `<div class="empty-state" style="margin-top:3rem"><strong>Проект не найден</strong><a class="link link--orange" href="/projects">Вернуться к проектам</a></div>`;
    return;
  }
  document.title = `${p.title} — Среда`;
  root.innerHTML = render(p);
  observeReveal(root);
  initSectionNav(root);

  root.addEventListener("click", async (e) => {
    const applyBtn = e.target.closest("[data-apply]");
    if (applyBtn) { e.preventDefault(); openApply(p.slug, p.title, p.roles, applyBtn.dataset.apply); }
    if (e.target.closest("[data-share]")) {
      try { await navigator.clipboard.writeText(location.href); toast("Ссылка скопирована"); }
      catch { toast("Скопируйте ссылку из адресной строки"); }
    }
  });
  document.addEventListener("project:applied", () => {
    $$("[data-apply]", root).forEach((b) => { b.disabled = true; b.innerHTML = `${icon("check")}Отклик отправлен`; });
  });
}

/** Подсветка текущего раздела в навигации при прокрутке. */
function initSectionNav(root) {
  const links = $$(".section-nav a", root);
  const sections = links.map((a) => $(a.getAttribute("href"), root)).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${e.target.id}`));
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((s) => io.observe(s));
}

function applyButton(p, role = "", cls = "btn--primary") {
  if (p.is_author || p.status !== "approved") return "";
  if (p.applied) return `<button class="btn btn--white" disabled>${icon("check")}Отклик отправлен</button>`;
  return `<button class="btn ${cls}" data-apply="${esc(role)}">${icon("send")}Откликнуться</button>`;
}

function render(p) {
  const d = p.details || {};
  const stageIndex = p.stages.indexOf(p.stage);
  const nav = [
    ["overview", "Обзор"],
    ["roles", `Роли${p.roles.length ? ` · ${p.roles.length}` : ""}`],
    ["team", `Команда${p.team.length ? ` · ${p.team.length}` : ""}`],
    d.roadmap?.length && ["roadmap", "Дорожная карта"],
    d.updates?.length && ["updates", "Обновления"],
  ].filter(Boolean);

  return `
    <nav class="breadcrumbs" aria-label="Навигация"><a href="/">Главная</a><span>/</span><a href="/projects">Проекты</a><span>/</span><a href="/projects?tag=${encodeURIComponent(p.category)}">${esc(p.category)}</a></nav>

    ${moderationNotice(p.status, p.moderation_note, "проект")}

    <section class="project-cover">
      ${imgTag(p.cover, "cover", p.title, 'loading="eager"')}
      <div class="project-cover__content">
        <div>
          <div class="project-cover__badges">
            <span class="badge badge--glass">${esc(p.category)}</span>
            <span class="badge badge--glass">${esc(p.stage)}</span>
            ${p.beta ? '<span class="badge badge--glass">Бета доступна</span>' : ""}
            ${p.is_author ? '<span class="badge badge--glass">Это ваш проект</span>' : ""}
          </div>
          <h1 class="project-cover__title split-words">${esc(p.title)}</h1>
          <p class="project-cover__pitch">${esc(p.description)}</p>
        </div>
        <div class="project-cover__actions">
          ${p.status === "approved" ? likeButton(p) : ""}
          <button class="btn btn--white" data-share>${icon("link")}Поделиться</button>
          ${applyButton(p)}
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
            : `<p class="project-desc" data-reveal>${esc(p.description)}</p><p class="muted" style="margin-top:1rem">Автор ещё не добавил подробное описание.</p>`}

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
            ${p.stages.map((s, i) => `
              <div class="stage-step ${i < stageIndex ? "is-done" : i === stageIndex ? "is-current" : ""}" style="--d:${i * 0.15}s">
                <div class="stage-step__bar"></div><strong>${esc(s)}</strong><small>${esc(STAGE_HINTS[s] || "")}</small>
              </div>`).join("")}
          </div>
        </section>

        <section id="roles" class="project-block">
          <h2 class="project-block__title" data-reveal>Открытые роли</h2>
          ${p.roles.length ? `<div class="roles">${p.roles.map((r, i) => `
            <article class="card role-card is-hoverable" data-reveal style="--d:${i * 0.06}s">
              <div class="role-card__head">
                <div><div class="role-card__title">${esc(r)}</div><small>${esc(capFirst(seeking(r)))} в команду</small></div>
                ${applyButton(p, r, "btn--sm btn--outline-orange")}
              </div>
              ${d.role_details?.[r] ? `<p class="role-card__text">${esc(d.role_details[r])}</p>` : ""}
            </article>`).join("")}</div>`
            : '<p class="muted" data-reveal>Команда сейчас укомплектована, но вы можете предложить помощь — автор увидит отклик.</p>'}
        </section>

        <section id="team" class="project-block">
          <h2 class="project-block__title" data-reveal>Команда</h2>
          ${p.team.length ? `<div class="team">${p.team.map((m, i) => `
            <a class="card team-card is-hoverable" href="${personUrl(m.slug)}" data-reveal style="--d:${i * 0.05}s">
              ${imgTag(m.avatar, "avatar", m.name)}
              <div><div class="team-card__name">${esc(m.name)}</div><small>${esc(m.role)}</small></div>
            </a>`).join("")}</div>` : '<p class="muted" data-reveal>Команда только собирается — станьте первым участником.</p>'}
        </section>

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
        ${p.owner ? `
        <a class="card card--pad is-hoverable owner-card" href="${personUrl(p.owner.slug)}" data-reveal="right">
          ${imgTag(p.owner.avatar, "avatar", p.owner.name)}
          <div><small class="muted">Автор проекта</small><div class="title-sm owner-card__name">${esc(p.owner.name)}${p.owner.verified ? verifiedMark() : ""}</div><small class="muted">${esc(p.owner.role)}</small></div>
        </a>` : `
        <div class="card card--pad owner-card" data-reveal="right">
          ${imgTag("", "avatar", p.owner_name)}
          <div><small class="muted">Автор проекта</small><div class="title-sm">${esc(p.owner_name)}</div></div>
        </div>`}
        <div class="card card--pad" data-reveal="right" style="--d:.08s">
          <div class="facts">
            <div class="fact"><span>Направление</span><span>${esc(p.category)}</span></div>
            <div class="fact"><span>Стадия</span><span>${esc(p.stage)}</span></div>
            <div class="fact"><span>Лицензия</span><span>${esc(p.license)}</span></div>
            <div class="fact"><span>Бета-версия</span><span>${p.beta ? "Есть" : "Нет"}</span></div>
            <div class="fact"><span>Участников</span><span>${p.team.length}</span></div>
            <div class="fact"><span>Открытых ролей</span><span>${p.roles.length}</span></div>
          </div>
          ${p.is_author ? "" : `<div class="aside-cta">${applyButton(p, "", "btn--primary btn--block")}</div>`}
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

    <section class="section">
      <div class="section__head"><h2 class="title-lg split-words">Похожие проекты</h2><a class="btn btn--outline" href="/projects">Все проекты ${icon("arrow-right", "sm")}</a></div>
      <div class="grid-cards">${p.related.map((r, i) => projectCard(r, { delay: i * 0.08 })).join("")}</div>
    </section>`;
}
