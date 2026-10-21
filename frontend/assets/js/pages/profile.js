/** Профиль специалиста / организации: шапка, вкладки (портфолио, блог, проекты, опыт или сотрудники, отзывы), боковая панель. */
import { get } from "../core/api.js";
import { $, $$, countLabel, esc, slugFromPath } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { currentUser } from "../core/session.js";
import { emptyState, listCard, moderationNotice, nameMarks, orgMark, personUrl, presenceLabel, projectUrl } from "../components/cards.js";
import { mountFeed } from "../components/feed.js";
import { openLightbox, openMediaBox } from "../components/modal.js";
import { observeReveal } from "../components/reveal.js";

let s;

export async function init() {
  const root = $("#profile");
  try { s = await get("/api/specialists/" + encodeURIComponent(slugFromPath())); }
  catch {
    root.innerHTML = `<div class="empty-state" style="margin-top:3rem"><strong>Профиль не найден</strong><a class="link link--orange" href="/services">Вернуться к каталогу</a></div>`;
    return;
  }
  document.title = `${s.name} — Среда`;
  const org = s.kind === "studio";
  const d = s.details;
  const tabs = [
    ["portfolio", "Портфолио", d.portfolio.length],
    ["blog", "Блог", 0],
    ["projects", "Проекты", d.participation.length],
    org ? ["staff", "Сотрудники", d.staff_count ?? d.staff.length] : ["experience", "Опыт", d.experience.length],
    ["reviews", "Отзывы", d.reviews.length],
  ];
  root.innerHTML = renderHead(tabs);

  const panel = $("#tab-panel");
  const show = (key, push = true) => {
    $$(".tab", root).forEach((t) => { const on = t.dataset.tab === key; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    panel.innerHTML = `<div class="tab-panel">${renderTab(key)}</div>`;
    if (key === "blog") mountFeed($("#blog-box", panel), "profile", s.slug, { emptyText: s.is_owner ? "Напишите первую запись — её увидят все, кто заходит в профиль." : "Записей в блоге пока нет." });
    observeReveal(panel);
    if (push) history.replaceState(null, "", `${location.search}#${key}`);
  };
  $$(".tab", root).forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  panel.addEventListener("click", (e) => {
    const work = e.target.closest("[data-work]");
    if (!work) return;
    e.preventDefault();
    openWork(d.portfolio[+work.dataset.work], work.closest(".work-card").querySelector("img")?.src);
  });
  const initial = location.hash.slice(1);
  show(tabs.some(([k]) => k === initial) ? initial : "portfolio", false);
  observeReveal(root);
}

/** Встраиваемый плеер для ссылок YouTube, VK Видео, Rutube и Vimeo; для остального — просто ссылка. */
function embedUrl(url) {
  try {
    const u = new URL(url);
    if (/youtu\.be$/.test(u.hostname)) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (/youtube\.com$/.test(u.hostname) && u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    if (/vimeo\.com$/.test(u.hostname)) return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean).pop()}`;
    if (/rutube\.ru$/.test(u.hostname)) { const id = u.pathname.split("/").filter(Boolean).pop(); return `https://rutube.ru/play/embed/${id}`; }
  } catch { /* неверная ссылка */ }
  return null;
}

function openWork(w, src) {
  const desc = w.description ? `<p style="color:#ccc;max-width:40rem;margin-top:.35rem">${esc(w.description)}</p>` : "";
  if (w.type === "video") {
    const embed = embedUrl(w.video_url);
    const media = embed ? `<iframe src="${esc(embed)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(w.title)}"></iframe>`
      : `<img src="${esc(src)}" alt="${esc(w.title)}">`;
    return openMediaBox(media, w.title, w.meta, `${desc}<a class="btn btn--sm btn--white" href="${esc(w.video_url)}" target="_blank" rel="noopener noreferrer">Открыть видео ${icon("arrow-up-right", "sm")}</a>`);
  }
  if (w.type === "project") {
    const link = w.project_slug ? projectUrl({ slug: w.project_slug }) : w.url;
    return openMediaBox(`<img src="${esc(src)}" alt="${esc(w.title)}">`, w.title, w.meta,
      `${desc}<a class="btn btn--sm btn--white" href="${esc(link)}" ${w.project_slug ? "" : 'target="_blank" rel="noopener noreferrer"'}>Открыть проект ${icon("arrow-up-right", "sm")}</a>`);
  }
  if (w.description) return openMediaBox(`<img src="${esc(src)}" alt="${esc(w.title)}">`, w.title, w.meta, desc);
  openLightbox(src, w.title, w.meta);
}

function renderHead(tabs) {
  const d = s.details;
  const org = s.kind === "studio";
  const user = currentUser();
  return `
    ${s.is_owner || s.status !== "approved" ? moderationNotice(s.status, s.moderation_note, "анкету") : ""}
    ${s.is_owner ? `<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap"><span>Это ваш${org ? "а организация" : "а анкета"}.</span><span class="row" style="--gap:.5rem"><a class="btn btn--sm btn--outline" href="/me">${icon("edit", "sm")}Редактировать</a>${org ? `<a class="btn btn--sm btn--outline" href="/me#org">${icon("users", "sm")}Сотрудники</a>` : ""}</span></div>` : ""}
    <div class="profile-banner"><img src="/assets/img/illustrations/profile-banner.webp" data-dark="/assets/img/illustrations/profile-banner-dark.webp" alt="" data-fb="art" data-variant="banner"></div>
    <div class="profile-head">
      ${imgTag(s.avatar, "avatar", s.name, `class="avatar profile-head__avatar ${org ? "is-org" : ""}" loading="eager"`)}
      <div class="profile-head__info">
        ${org ? `<p class="profile-head__kind">${orgMark()}Организация</p>` : ""}
        <h1 class="profile-head__name"><span>${esc(s.name)}</span>${s.verified ? `<span class="verified verified--lg" title="${org ? "Организация подтверждена" : "Личность подтверждена"}" aria-label="${org ? "Организация подтверждена" : "Личность подтверждена"}">${icon("check")}</span>` : ""}</h1>
        <div class="profile-head__role">${esc(s.role)}</div>
        <div class="profile-meta">
          <span>${icon("pin")}${esc([s.city, ...s.formats].join(" · "))}</span>
          ${s.open ? `<span class="badge badge--green"><span class="dot" style="background:var(--green)"></span>${org ? "Открыта" : "Открыт"} к проектам</span>`
                   : `<span class="badge badge--muted">Сейчас ${org ? "занята" : "занят"}</span>`}
          ${presenceLabel(s.presence)}
        </div>
      </div>
      <div class="profile-head__actions">
        ${s.is_owner ? "" : `
        <button class="btn btn--primary btn--lg" data-action="invite" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}">${icon("user-plus")}Пригласить в проект</button>
        <button class="btn btn--outline btn--lg" data-action="message" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}">${icon("chat")}Написать</button>
        <button class="icon-btn ${s.bookmarked ? "is-on" : ""}" style="width:3.75rem;height:3.75rem;border-radius:1.1rem" data-action="bookmark" data-slug="${esc(s.slug)}" aria-label="В избранное" title="В избранное">${icon("bookmark")}</button>
        ${user ? `<button class="icon-btn" style="width:3.75rem;height:3.75rem;border-radius:1.1rem" data-action="report" data-type="${org ? "org" : "profile"}" data-slug="${esc(s.slug)}" data-title="${esc(s.name)}" aria-label="Пожаловаться" title="Пожаловаться">${icon("flag")}</button>` : ""}`}
      </div>
    </div>

    <div class="tabs" role="tablist">${tabs.map(([key, label, n]) => `<button class="tab" role="tab" data-tab="${key}" aria-selected="false">${label}${n ? ` <span class="muted">${n}</span>` : ""}</button>`).join("")}</div>

    <div class="profile-body">
      <div id="tab-panel"></div>
      <aside class="card aside" data-reveal="right">
        ${d.skills.length ? `<section><h3>Навыки</h3><div class="chips">${d.skills.map((k) => `<span class="tag tag--lg">${esc(k)}</span>`).join("")}</div></section>` : ""}
        ${s.directions.length ? `<section><h3>Направления</h3><div class="chips">${s.directions.map((k) => `<span class="tag tag--lg">${esc(k)}</span>`).join("")}</div></section>` : ""}
        <section><h3>Формат работы</h3><p class="muted">${esc(d.work_format)}</p></section>
        ${d.organizations?.length ? `<section><h3>Организации</h3><div class="stack" style="--gap:.6rem">${d.organizations.map((o) =>
          `<a class="owner" href="${personUrl(o.slug)}">${imgTag(o.avatar, "avatar", o.name, 'class="is-org"')}<span>${esc(o.name)}${o.role ? ` · <small class="muted">${esc(o.role)}</small>` : ""}</span>${nameMarks({ kind: "studio", verified: o.verified })}</a>`).join("")}</div></section>` : ""}
        ${d.contacts.length ? `<section><h3>Контакты</h3><div class="contacts">${d.contacts.map((c) =>
          `<a class="btn btn--outline-orange" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${icon(c.icon)}${esc(c.label)}${icon("arrow-up-right", "sm")}</a>`).join("")}</div>
          <p class="aside__note">Опубликованы владельцем профиля</p></section>` : ""}
      </aside>
    </div>`;
}

const roleBadge = (p) => p.founder
  ? `<span class="badge badge--founder">${icon("crown", "sm")}Основатель</span>`
  : `<span class="badge badge--purple">Участник${p.member_role ? ` · ${esc(p.member_role)}` : ""}</span>`;

function projectList(list) {
  return `<div class="stack" style="--gap:.75rem">${list.map((p) => listCard(projectUrl(p), imgTag(p.cover, "cover", p.title), p.title,
    `${p.category} · ${p.stage}`, roleBadge(p) + (p.hidden ? '<span class="badge badge--muted">Скрыт в профиле</span>' : ""))).join("")}</div>`;
}

const WORK_TYPES = { video: ["video", "Видео"], project: ["folder", "Проект"] };

function renderTab(key) {
  const d = s.details;
  const org = s.kind === "studio";
  if (key === "portfolio") return `
    <h2 class="title">${org ? "Об организации" : "О себе"}</h2>
    <p class="profile-bio">${esc(d.bio)}</p>
    <div class="h-count"><h2 class="title">Портфолио</h2><span>${countLabel(d.portfolio.length, ["работа", "работы", "работ"])}</span></div>
    ${d.portfolio.length ? `<div class="grid-cards" style="--card-min:17rem">${d.portfolio.map((w, k) => `
      <article class="card work-card is-hoverable" data-reveal style="--d:${k * 0.06}s">
        <div class="media">${imgTag(w.cover, "cover", w.title)}
          ${WORK_TYPES[w.type] ? `<span class="badge badge--glass work-card__type">${icon(WORK_TYPES[w.type][0], "sm")}${WORK_TYPES[w.type][1]}</span>` : ""}
          ${w.type === "video" ? `<span class="play"><span>${icon("play")}</span></span>` : ""}</div>
        <div class="work-card__foot">
          <div><h3 class="work-card__title"><a class="card__link" href="#" data-work="${k}">${esc(w.title)}</a></h3><div class="work-card__meta">${esc(w.meta)}</div></div>
          <span class="round-btn">${icon("arrow-up-right", "sm")}</span>
        </div>
      </article>`).join("")}</div>` : emptyState("Работ пока нет", s.is_owner ? "Добавьте изображения, видео или проекты в кабинете." : "Портфолио скоро появится.")}`;
  if (key === "blog") return `<h2 class="title" style="margin-bottom:1.25rem">Блог</h2>
    ${s.blog_visibility === "members" && s.is_member ? `<p class="muted" style="margin:-.5rem 0 1rem">${icon("lock", "sm")} Блог видят только ${org ? "сотрудники" : "вы"}.</p>` : ""}
    <div id="blog-box"><div class="skeleton" style="min-height:8rem"></div></div>`;
  if (key === "experience") return `<h2 class="title">Опыт</h2><div class="timeline" style="margin-top:1.25rem">${d.experience.map((x, k) => `
      <div class="card timeline__item" data-reveal style="--d:${k * 0.06}s"><div><strong>${esc(x.place)}</strong><div><small>${esc(x.role)}</small></div></div><small>${esc(x.period)}</small></div>`).join("")
      || emptyState("Опыт не указан", "Специалист пока не заполнил этот раздел.")}</div>`;
  if (key === "staff") {
    const hidden = d.staff_visibility !== "all" && !s.is_member;
    return `<div class="h-count"><h2 class="title">Сотрудники</h2>${d.staff_count != null ? `<span>${countLabel(d.staff_count, ["человек", "человека", "человек"])}</span>` : ""}</div>
      ${hidden ? `<p class="muted" style="margin-bottom:1rem">${icon("lock", "sm")} ${d.staff_visibility === "hidden" ? "Организация не раскрывает состав" : "Показаны не все сотрудники"}.</p>` : ""}
      ${d.staff.length ? `<div class="team">${d.staff.map((m, i) => `
        <a class="card team-card is-hoverable" href="${personUrl(m.slug)}" data-reveal style="--d:${i * 0.05}s">
          ${imgTag(m.avatar, "avatar", m.name)}
          <div><div class="team-card__name">${esc(m.name)}${nameMarks({ kind: "person", verified: m.verified })}</div><small>${esc(m.role || m.profile_role)}</small>
          ${s.is_member && m.can_post ? '<div class="list-card__badges"><span class="badge badge--purple">Публикует в блоге</span></div>' : ""}</div>
        </a>`).join("")}</div>` : hidden ? "" : emptyState("Сотрудники не указаны", "Организация пока не добавила команду.")}`;
  }
  if (key === "projects") {
    const active = d.participation.filter((p) => !p.closed), closed = d.participation.filter((p) => p.closed);
    if (!d.participation.length) return `<h2 class="title">Проекты</h2><div style="margin-top:1.25rem">${emptyState("Проектов нет", s.is_owner ? "Создайте проект или откликнитесь на открытые роли." : "Пригласите в свой проект.")}</div>`;
    return `<h2 class="title" style="margin-bottom:1.25rem">Проекты</h2>
      ${active.length ? `<h3 class="group-title">Активные · ${active.length}</h3>${projectList(active)}` : ""}
      ${closed.length ? `<h3 class="group-title">Завершённые · ${closed.length}</h3>${projectList(closed)}` : ""}
      ${s.is_owner ? '<p class="muted" style="margin-top:1rem">Какие проекты показывать в профиле, можно выбрать в <a class="link" href="/me#settings">настройках</a>.</p>' : ""}`;
  }
  return `<h2 class="title">Отзывы</h2><div class="timeline" style="margin-top:1.25rem">${d.reviews.map((r, k) => `
      <div class="card review" data-reveal style="--d:${k * 0.06}s">${imgTag(r.avatar, "avatar", r.author)}
        <div><strong>${r.slug ? `<a class="u-hover" href="${personUrl(r.slug)}">${esc(r.author)}</a>` : esc(r.author)}</strong><p>${esc(r.text)}</p></div></div>`).join("")
      || emptyState("Отзывов пока нет", "Они появятся после совместных проектов.")}</div>`;
}
