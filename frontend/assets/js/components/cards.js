/** Шаблоны карточек. Каждая карточка целиком кликабельна (растянутая ссылка .card__link). */
import { esc, seeking } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";

export const verifiedMark = (title = "Подтверждено") => `<span class="verified" title="${title}">${icon("check")}</span>`;
export const projectUrl = (p) => (p.slug ? `/projects/${encodeURIComponent(p.slug)}` : "/projects");
export const personUrl = (slug) => `/people/${encodeURIComponent(slug)}`;

export function ownerLink(p) {
  const inner = `${imgTag(p.owner_logo, "avatar", p.owner_name)}<span>${esc(p.owner_name)}</span>`;
  return p.owner_slug ? `<a class="owner" href="${personUrl(p.owner_slug)}">${inner}</a>` : `<span class="owner">${inner}</span>`;
}

export function teamStack(team, max = 3) {
  if (!team?.length) return "";
  const shown = team.slice(0, max).map((m) =>
    `<a href="${personUrl(m.slug)}" title="${esc(m.name)} — ${esc(m.role)}">${imgTag(m.avatar, "avatar", m.name)}</a>`).join("");
  const more = team.length > max ? `<span class="more">+${team.length - max}</span>` : "";
  return `<div class="avatar-stack">${shown}${more}</div>`;
}

export function roleBadges(p, { stage = true } = {}) {
  const out = [];
  if (p.roles.length) out.push(`<span class="badge badge--orange">${esc(seeking(p.roles[0]))}${p.roles.length > 1 ? ` +${p.roles.length - 1}` : ""}</span>`);
  if (stage && p.stage === "В разработке") out.push('<span class="badge badge--purple">В разработке</span>');
  if (stage && p.beta) out.push('<span class="badge badge--purple">Бета доступна</span>');
  return out.join("");
}

export const likeButton = (p) =>
  `<button class="like-btn ${p.liked ? "is-on" : ""}" data-action="like" data-id="${p.id}" aria-pressed="${p.liked}" aria-label="Нравится">${icon("heart")}<span>${p.likes}</span></button>`;

export function projectCard(p, { reveal = true, delay = 0 } = {}) {
  return `
    <article class="card project-card is-hoverable" ${reveal ? `data-reveal style="--d:${delay}s"` : ""}>
      <div class="media media--16x9">
        ${imgTag(p.cover, "cover", p.title)}
        <div class="project-card__badges"><span class="badge badge--glass">${icon("folder", "sm")}${esc(p.category)}</span></div>
        ${likeButton(p)}
      </div>
      <div class="project-card__body">
        <h3 class="project-card__title"><a class="card__link" href="${projectUrl(p)}">${esc(p.title)}</a></h3>
        <p class="project-card__text">${esc(p.description)}</p>
        <div class="project-card__badges-row">${roleBadges(p)}</div>
        <div class="project-card__foot">${ownerLink(p)}${teamStack(p.team)}</div>
      </div>
    </article>`;
}

export function specCard(s, { delay = 0 } = {}) {
  return `
    <article class="card spec-card is-hoverable" data-reveal style="--d:${delay}s">
      <div class="media media--banner">${imgTag(s.cover, "cover", s.name)}</div>
      <div class="spec-card__info">
        ${imgTag(s.avatar, "avatar", s.name, 'class="avatar spec-card__avatar"')}
        <div class="spec-card__meta">
          <h3 class="spec-card__name"><a class="card__link" href="${personUrl(s.slug)}">${esc(s.name)}</a>${s.verified ? verifiedMark() : ""}</h3>
          <div class="spec-card__role">${esc(s.role)} · ${esc(s.city)}</div>
          <div class="spec-card__tags">${s.tags.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        </div>
        <div class="spec-card__actions">
          <button class="icon-btn ${s.bookmarked ? "is-on" : ""}" data-action="bookmark" data-slug="${esc(s.slug)}" aria-pressed="${s.bookmarked}" aria-label="В избранное">${icon("bookmark", "sm")}</button>
          <button class="btn btn--sm btn--outline-orange" data-action="invite" data-slug="${esc(s.slug)}" data-name="${esc(s.name)}" data-mode="discuss">Обсудить проект</button>
        </div>
      </div>
    </article>`;
}

export function personTile(s, delay = 0) {
  return `
    <article class="card person-tile is-hoverable" data-reveal style="--d:${delay}s">
      ${imgTag(s.avatar, "avatar", s.name, 'class="avatar"')}
      <h3 class="person-tile__name"><a class="card__link" href="${personUrl(s.slug)}">${esc(s.name)}</a>${s.verified ? verifiedMark() : ""}</h3>
      <div class="person-tile__role">${esc(s.role)}</div>
      ${s.open ? '<span class="badge badge--green"><span class="dot" style="background:var(--green)"></span>Открыт к проектам</span>' : '<span class="badge" style="background:var(--surface-2)">Сейчас занят</span>'}
    </article>`;
}

export function listCard(href, img, title, meta) {
  return `<a class="card list-card is-hoverable" href="${href}">${img}<div><div class="list-card__title">${esc(title)}</div><div class="list-card__meta">${esc(meta)}</div></div><span class="round-btn">${icon("arrow-right", "sm")}</span></a>`;
}

const STATUS = {
  pending: ["badge--purple", "На модерации"],
  approved: ["badge--green", "Опубликовано"],
  rejected: ["badge--orange", "Отклонено"],
};
export const statusBadge = (status) => {
  const [cls, label] = STATUS[status] || STATUS.pending;
  return `<span class="badge ${cls}"><span class="dot" style="background:currentColor"></span>${label}</span>`;
};

/** Плашка для автора/админа, если материал ещё не опубликован. */
export function moderationNotice(status, note, what = "проект") {
  if (!status || status === "approved") return "";
  if (status === "rejected") {
    return `<div class="notice notice--warn" role="status"><strong>Модератор отклонил ${what}.</strong> ${note ? `Причина: ${esc(note)}.` : ""} Исправьте и отправьте снова — после проверки его увидят все.</div>`;
  }
  return `<div class="notice" role="status"><strong>На модерации.</strong> Сейчас ${what} видите только вы и администраторы — после проверки он появится в каталоге.</div>`;
}

export const skeletons = (n) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join("");
export const emptyState = (title, text) => `<div class="empty-state"><strong>${esc(title)}</strong>${esc(text)}</div>`;
