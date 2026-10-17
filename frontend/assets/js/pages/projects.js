/** «Проекты»: каталог с фильтрами и подгрузкой «Показать ещё». */
import { get } from "../core/api.js";
import { $, $$, countLabel, debounce, esc, plural, toQuery } from "../core/dom.js";
import { emptyState, projectCard, skeletons } from "../components/cards.js";
import { observeReveal } from "../components/reveal.js";

const PAGE_SIZE = 9;

export async function init() {
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get("q") || "", tag: params.get("tag") || "", stage: params.get("stage") || "", role: params.get("role") || "",
    license: params.get("license") || "", beta: params.get("beta") === "true", has_roles: params.get("has_roles") === "true",
    sort: params.get("sort") || "popular", mine: params.get("mine") === "true",
  };
  const grid = $("#project-grid"), more = $("#load-more"), search = $("#project-search");
  if (state.mine) {
    $("#projects-title").textContent = "Мои проекты";
    $("#projects-title").insertAdjacentHTML("afterend", '<a class="btn btn--sm btn--outline" href="/projects">Все проекты</a>');
  }
  let offset = 0;

  const meta = await get("/api/projects/meta");
  $("#project-chips").insertAdjacentHTML("beforeend", meta.categories.map((c) => `<button class="chip" data-tag="${esc(c)}">${esc(c)}</button>`).join(""));
  const fill = (sel, items) => $(sel).insertAdjacentHTML("beforeend", items.map((v) => `<option>${esc(v)}</option>`).join(""));
  fill("#f-stage", meta.stages);
  fill("#f-role", meta.roles);
  fill("#f-license", meta.licenses);

  const syncControls = () => {
    search.value = state.q;
    $$("#project-chips .chip").forEach((c) => c.classList.toggle("is-active", (c.dataset.tag || "") === state.tag));
    $("#f-stage").value = state.stage;
    $("#f-role").value = state.role;
    $("#f-license").value = state.license;
    $("#f-beta").checked = state.beta;
    $("#f-open").checked = state.has_roles;
    $("#project-sort").value = state.sort;
  };

  const load = async (append = false) => {
    if (!append) {
      offset = 0;
      syncControls();
      history.replaceState(null, "", "?" + toQuery(state));
      grid.innerHTML = skeletons(6);
    }
    more.disabled = true;
    try {
      const r = await get("/api/projects?" + toQuery({ ...state, offset, limit: PAGE_SIZE }));
      const html = r.items.map((p, i) => projectCard(p, { delay: i * 0.05 })).join("");
      if (append) grid.insertAdjacentHTML("beforeend", html);
      else grid.innerHTML = html || (state.mine
        ? emptyState("У вас пока нет проектов", "Нажмите «Создать проект» — и соберите под идею команду.")
        : emptyState("Проектов не нашлось", "Измените фильтры или создайте свой проект."));
      offset += r.items.length;
      $("#project-count").textContent = countLabel(r.total, ["проект", "проекта", "проектов"]);
      $("#project-shown").textContent = `Показываем ${offset} из ${r.total} ${plural(r.total, ["проекта", "проектов", "проектов"])}`;
      more.hidden = offset >= r.total;
      observeReveal(grid);
    } finally { more.disabled = false; }
  };

  search.addEventListener("input", debounce(() => { state.q = search.value; load(); }));
  $("#project-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.tag = chip.dataset.tag || "";
    load();
  });
  [["#f-stage", "stage"], ["#f-role", "role"], ["#f-license", "license"], ["#project-sort", "sort"]].forEach(([sel, key]) =>
    $(sel).addEventListener("change", (e) => { state[key] = e.target.value; load(); }));
  $("#f-beta").addEventListener("change", (e) => { state.beta = e.target.checked; load(); });
  $("#f-open").addEventListener("change", (e) => { state.has_roles = e.target.checked; load(); });
  more.addEventListener("click", () => load(true));
  await load();
}
