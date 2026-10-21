/** Общий поиск с выпадающими результатами и навигацией стрелками. */
import { get } from "../core/api.js";
import { $, $$, debounce, esc, toQuery } from "../core/dom.js";
import { imgTag } from "../core/placeholders.js";
import { personUrl, projectUrl } from "./cards.js";

export function initGlobalSearch(root) {
  const input = $("input", root), box = $(".search__results", root);
  let focused = -1;

  const item = (href, img, title, sub) => `<a class="search__item" href="${href}">${img}<span>${esc(title)}<small>${esc(sub)}</small></span></a>`;
  const group = (title, items, fn) => (items.length ? `<div class="search__group">${title}</div>${items.map(fn).join("")}` : "");

  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; return; }
    const r = await get("/api/search?" + toQuery({ q })).catch(() => null);
    if (!r) return;
    const person = (s) => item(personUrl(s.slug), imgTag(s.avatar, "avatar", s.name, s.kind === "studio" ? 'class="is-org"' : ""), s.name, (s.kind === "studio" ? "Организация · " : "") + s.role);
    box.innerHTML = group("Люди", r.people, person) + group("Организации", r.studios, person) +
      group("Проекты", r.projects, (p) => item(projectUrl(p), imgTag(p.cover, "cover", p.title, 'class="is-thumb"'), p.title, p.owner_name)) ||
      `<div class="search__empty">Ничего не нашли по запросу «${esc(q)}»</div>`;
    box.hidden = false;
    focused = -1;
  });

  input.addEventListener("input", run);
  input.addEventListener("focus", run);
  input.addEventListener("keydown", (e) => {
    const items = $$(".search__item", box);
    if (e.key === "Escape") { box.hidden = true; return; }
    if (!items.length || !["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Enter") { (items[focused] || items[0]).click(); return; }
    focused = (focused + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("is-focused", i === focused));
    items[focused].scrollIntoView({ block: "nearest" });
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) box.hidden = true; });
  // «/» — быстрый фокус на поиск
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
  });
}
