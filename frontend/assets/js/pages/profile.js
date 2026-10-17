/** Профиль специалиста / студии: шапка, вкладки (портфолио, опыт, проекты, отзывы), боковая панель. */
import { get } from "../core/api.js";
import { $, $$, countLabel, esc, slugFromPath } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { emptyState, listCard, moderationNotice, personUrl, projectUrl, verifiedMark } from "../components/cards.js";
import { openLightbox } from "../components/modal.js";
import { observeReveal } from "../components/reveal.js";

const TABS = ["Портфолио", "Опыт", "Проекты", "Отзывы"];

export async function init() {
  const root = $("#profile");
  let s;
  try { s = await get("/api/specialists/" + encodeURIComponent(slugFromPath())); }
  catch {
    root.innerHTML = `<div class="empty-state" style="margin-top:3rem"><strong>Профиль не найден</strong><a class="link link--orange" href="/services">Вернуться к каталогу</a></div>`;
    return;
  }
  document.title = `${s.name} — Среда`;
  root.innerHTML = renderHead(s);

  const panel = $("#tab-panel");
  const show = (i) => {
    $$(".tab", root).forEach((t, k) => { t.classList.toggle("is-active", k === i); t.setAttribute("aria-selected", k === i); });
    panel.innerHTML = `<div class="tab-panel">${renderTab(s, i)}</div>`;
    observeReveal(panel);
  };
  $$(".tab", root).forEach((t, i) => t.addEventListener("click", () => show(i)));
  panel.addEventListener("click", (e) => {
    const work = e.target.closest("[data-work]");
    if (!work) return;
    e.preventDefault();
    const w = s.details.portfolio[+work.dataset.work];
    openLightbox(work.closest(".work-card").querySelector("img").src, w.title, w.meta);
  });
  show(0);
  observeReveal(root);
}

function renderHead(s) {
  const d = s.details;
  const studio = s.kind === "studio";
  return `
    ${s.is_owner || s.status !== "approved" ? moderationNotice(s.status, s.moderation_note, "анкету") : ""}
    ${s.is_owner ? `<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap"><span>Это ваша анкета.</span><a class="btn btn--sm btn--outline" href="/me">Редактировать анкету</a></div>` : ""}
    <div class="profile-banner"><img src="/assets/img/illustrations/profile-banner.webp" alt="" data-fb="art" data-variant="banner"></div>
    <div class="profile-head">
      ${imgTag(s.avatar, "avatar", s.name, 'class="avatar profile-head__avatar" loading="eager"')}
      <div class="profile-head__info">
        <h1 class="profile-head__name split-words">${esc(s.name)}</h1>
        <div class="profile-head__role">${esc(s.role)}</div>
        <div class="profile-meta">
          <span>${icon("pin")}${esc([s.city, ...s.formats].join(" · "))}</span>
          ${s.open ? `<span class="badge badge--green"><span class="dot" style="background:var(--green)"></span>${studio ? "Открыта" : "Открыт"} к проектам</span>`
                   : `<span class="badge" style="background:var(--surface-2)">Сейчас ${studio ? "занята" : "занят"}</span>`}
          ${s.verified ? `<span>${verifiedMark()}${studio ? "Организация подтверждена" : "Личность подтверждена"}</span>` : ""}
        </div>
      </div>
      <div class="profile-head__actions">
        <button class="btn btn--primary btn--lg" data-action="invite" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}">${icon("user-plus")}Пригласить в проект</button>
        <button class="btn btn--outline btn--lg" data-action="invite" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}" data-mode="message">${icon("message")}Написать</button>
        <button class="icon-btn ${s.bookmarked ? "is-on" : ""}" style="width:3.75rem;height:3.75rem;border-radius:1.1rem" data-action="bookmark" data-slug="${esc(s.slug)}" aria-label="В избранное">${icon("bookmark")}</button>
      </div>
    </div>

    <div class="tabs" role="tablist">${TABS.map((t, i) => `<button class="tab" role="tab" aria-selected="${!i}">${t}${counter(d, i)}</button>`).join("")}</div>

    <div class="profile-body">
      <div id="tab-panel"></div>
      <aside class="card aside" data-reveal="right">
        <section><h3>Навыки</h3><div class="chips">${d.skills.map((k) => `<span class="tag tag--lg">${esc(k)}</span>`).join("")}</div></section>
        <section><h3>Формат работы</h3><p class="muted">${esc(d.work_format)}</p></section>
        ${d.contacts.length ? `<section><h3>Контакты</h3><div class="contacts">${d.contacts.map((c) =>
          `<a class="btn btn--outline-orange" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${icon(c.icon)}${esc(c.label)}${icon("arrow-up-right", "sm")}</a>`).join("")}</div>
          <p class="aside__note">Опубликованы владельцем профиля</p></section>` : ""}
        ${d.participation.length ? `<section><h3>Участие в проектах</h3><div class="stack" style="--gap:.6rem">${d.participation.slice(0, 4).map((p) =>
          listCard(projectUrl(p), imgTag(p.cover, "cover", p.title), p.title, `${p.owner ? "Автор" : "В команде"} · ${p.stage}`)).join("")}</div></section>` : ""}
      </aside>
    </div>`;
}

const counter = (d, i) => {
  const n = [d.portfolio.length, d.experience.length, d.participation.length, d.reviews.length][i];
  return n ? ` <span class="muted">${n}</span>` : "";
};

function renderTab(s, i) {
  const d = s.details;
  if (i === 0) return `
    <h2 class="title">О себе</h2>
    <p class="profile-bio">${esc(d.bio)}</p>
    <div class="h-count"><h2 class="title">Портфолио</h2><span>${countLabel(d.portfolio.length, ["работа", "работы", "работ"])}</span></div>
    ${d.portfolio.length ? `<div class="grid-cards" style="--card-min:19rem">${d.portfolio.map((w, k) => `
      <article class="card work-card is-hoverable" data-reveal style="--d:${k * 0.08}s">
        <div class="media">${imgTag(w.cover, "cover", w.title)}</div>
        <div class="work-card__foot">
          <div><h3 class="work-card__title"><a class="card__link" href="#" data-work="${k}">${esc(w.title)}</a></h3><div class="work-card__meta">${esc(w.meta)}</div></div>
          <span class="round-btn">${icon("arrow-up-right", "sm")}</span>
        </div>
      </article>`).join("")}</div>` : emptyState("Работ пока нет", "Портфолио скоро появится.")}`;
  if (i === 1) return `<h2 class="title">Опыт</h2><div class="timeline" style="margin-top:1.25rem">${d.experience.map((x, k) => `
      <div class="card timeline__item" data-reveal style="--d:${k * 0.06}s"><div><strong>${esc(x.place)}</strong><div><small>${esc(x.role)}</small></div></div><small>${esc(x.period)}</small></div>`).join("")
      || emptyState("Опыт не указан", "Специалист пока не заполнил этот раздел.")}</div>`;
  if (i === 2) return `<h2 class="title">Проекты</h2><div class="stack" style="--gap:.75rem;margin-top:1.25rem">${d.participation.map((p) =>
      listCard(projectUrl(p), imgTag(p.cover, "cover", p.title), p.title, `${p.category} · ${p.owner ? "автор" : "в команде"} · ${p.stage}`)).join("")
      || emptyState("Проектов нет", "Пригласите специалиста в свой проект.")}</div>`;
  return `<h2 class="title">Отзывы</h2><div class="timeline" style="margin-top:1.25rem">${d.reviews.map((r, k) => `
      <div class="card review" data-reveal style="--d:${k * 0.06}s">${imgTag(r.avatar, "avatar", r.author)}
        <div><strong>${r.slug ? `<a class="u-hover" href="${personUrl(r.slug)}">${esc(r.author)}</a>` : esc(r.author)}</strong><p>${esc(r.text)}</p></div></div>`).join("")
      || emptyState("Отзывов пока нет", "Они появятся после совместных проектов.")}</div>`;
}
