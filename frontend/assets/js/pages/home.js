/** Главная: моушен-hero, поиск, «Открытия недели», люди, цифры. */
import { get } from "../core/api.js";
import { $, esc, capFirst, seeking, toQuery } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { emptyState, personTile, personUrl, projectCard, projectUrl, skeletons, verifiedMark } from "../components/cards.js";
import { observeReveal } from "../components/reveal.js";
import { initGlobalSearch } from "../components/search.js";
import { initHeroMotion } from "./hero-motion.js";

export async function init() {
  initHeroMotion();
  initGlobalSearch($("[data-global-search]"));
  await Promise.all([initDiscover(), renderSide(), renderPeople(), renderStats()]);
}

async function initDiscover() {
  const grid = $("#discover-grid"), chips = $("#discover-chips");
  const load = async (tag = "") => {
    grid.innerHTML = skeletons(3);
    const r = await get("/api/projects?" + toQuery({ tag, limit: 6 }));
    grid.innerHTML = r.items.map((p, i) => projectCard(p, { delay: i * 0.06 })).join("") || emptyState("Пока пусто", "В этой категории ещё нет проектов.");
    observeReveal(grid);
  };
  const meta = await get("/api/projects/meta");
  chips.insertAdjacentHTML("beforeend", meta.categories.map((c) => `<button class="chip" data-tag="${esc(c)}">${esc(c)}</button>`).join(""));
  chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    load(chip.dataset.tag);
  });
  await load();
}

/** Правая колонка: топ-специалист → команда → проект. Кого показывать, выбирает администратор в /admin. */
async function renderSide() {
  const side = $("#home-side");
  try {
    const { freelancer: p, team: st, project: v } = await get("/api/home");
    const label = (text, featured) => `<span class="side-label">${featured ? icon("sparkle", "sm") : ""}${text}</span>`;
    side.innerHTML = `
      ${p ? `<div data-reveal="right">${label("Топ-специалист", p.featured)}
      <article class="card spec-mini is-hoverable">
        ${imgTag(p.avatar, "avatar", p.name, 'class="spec-mini__photo"')}
        <div>
          <h3 class="spec-mini__name"><a class="card__link" href="${personUrl(p.slug)}">${esc(p.name)}</a>${p.verified ? verifiedMark() : ""}</h3>
          <div class="spec-mini__role">${esc(p.role)}</div>
          <div class="chips">${p.tags.slice(0, 2).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
          <p class="spec-mini__about">${esc(p.about)}</p>
          <button class="btn btn--sm btn--outline-orange btn--block" data-action="invite" data-slug="${esc(p.slug)}" data-name="${esc(p.name)}">${icon("user-plus", "sm")}Пригласить</button>
        </div>
      </article></div>` : ""}
      ${st ? `<div data-reveal="right" style="--d:.08s">${label("Команда недели", st.featured)}
      <article class="card studio-mini is-hoverable">
        <div class="studio-mini__row">
          ${imgTag(st.avatar, "avatar", st.name, 'class="studio-mini__logo"')}
          <div>
            <h3 class="studio-mini__name"><a class="card__link" href="${personUrl(st.slug)}">${esc(st.name)}</a>${st.verified ? verifiedMark() : ""}</h3>
            <p>${esc(st.about)}</p>
          </div>
          <span class="round-btn">${icon("arrow-right", "sm")}</span>
        </div>
        ${st.thumbs.length ? `<div class="studio-mini__thumbs">${st.thumbs.map((t) => imgTag(t.cover, "cover", t.title)).join("")}</div>` : ""}
      </article></div>` : ""}
      ${v ? `<div data-reveal="right" style="--d:.16s">${label("Проект недели", v.featured)}
      <a class="vacancy" href="${projectUrl(v)}">
        <span class="vacancy__icon">${icon(v.roles.length ? "users" : "rocket")}</span>
        <small>${v.roles.length ? `Команда «${esc(v.title)}» ищет` : esc(v.category)}</small>
        <h3>${esc(v.roles.length ? capFirst(seeking(v.roles[0])) : v.title)}</h3>
        <p>${esc(v.description)}</p>
        <span class="round-btn">${icon("arrow-right", "sm")}</span>
      </a></div>` : ""}`;
    observeReveal(side);
  } catch { side.innerHTML = ""; }
}
async function renderPeople() {
  const grid = $("#people-grid");
  const r = await get("/api/specialists?kind=person");
  grid.innerHTML = r.items.slice(0, 6).map((s, i) => personTile(s, i * 0.06)).join("");
  observeReveal(grid);
}

async function renderStats() {
  const [people, studios, projects, open, meta] = await Promise.all([
    get("/api/specialists?kind=person"), get("/api/specialists?kind=studio"), get("/api/projects?limit=1"),
    get("/api/projects?has_roles=true&limit=1"), get("/api/specialists/meta"),
  ]);
  const set = (key, n) => { const el = $(`[data-stat="${key}"]`); if (el) el.dataset.count = n; };
  set("people", people.total);
  set("studios", studios.total);
  set("projects", projects.total);
  set("open", open.total);
  set("cities", meta.cities.length);
  observeReveal($("#stats"));
}
