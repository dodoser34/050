/** «Услуги»: каталог специалистов и студий с фильтрами. Состояние фильтров хранится в адресной строке. */
import { get } from "../core/api.js";
import { $, $$, countLabel, debounce, esc, toQuery } from "../core/dom.js";
import { emptyState, skeletons, specCard } from "../components/cards.js";
import { observeReveal } from "../components/reveal.js";

export async function init() {
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get("q") || "", kind: params.get("kind") || "", direction: params.getAll("direction"),
    format: params.getAll("format"), city: params.get("city") || "", available: params.get("available") === "true",
    sort: params.get("sort") || "popular",
  };
  const list = $("#spec-list"), count = $("#spec-count"), search = $("#spec-search");
  const meta = await get("/api/specialists/meta");

  $("#spec-chips").insertAdjacentHTML("beforeend", meta.directions.slice(0, 8).map((d) => `<button class="chip" data-direction="${esc(d)}">${esc(d)}</button>`).join(""));
  $("#direction-opts").innerHTML = meta.directions.map((d) => checkbox("direction", d)).join("");
  $("#format-opts").innerHTML = meta.formats.map((f) => checkbox("format", f)).join("");
  $("#city").insertAdjacentHTML("beforeend", meta.cities.map((c) => `<option>${esc(c)}</option>`).join(""));
  $("#kind").value = state.kind;
  // на планшете и телефоне группы фильтров свёрнуты, чтобы список был виден сразу
  if (matchMedia("(max-width: 1100px)").matches) $$(".filter-group").forEach((g) => (g.open = false));

  const syncControls = () => {
    search.value = state.q;
    $$("#spec-chips .chip").forEach((c) => {
      const d = c.dataset.direction || "";
      c.classList.toggle("is-active", d ? state.direction.length === 1 && state.direction[0] === d : !state.direction.length);
    });
    $$('[name="direction"]').forEach((c) => (c.checked = state.direction.includes(c.value)));
    $$('[name="format"]').forEach((c) => (c.checked = state.format.includes(c.value)));
    $("#city").value = state.city;
    $("#available").checked = state.available;
    $("#spec-sort").value = state.sort;
  };

  const load = async () => {
    syncControls();
    history.replaceState(null, "", "?" + toQuery(state));
    list.innerHTML = skeletons(4);
    try {
      const r = await get("/api/specialists?" + toQuery(state));
      count.textContent = countLabel(r.total, ["профиль", "профиля", "профилей"]);
      list.innerHTML = r.items.map((s, i) => specCard(s, { delay: Math.min(i, 8) * 0.05 })).join("") ||
        emptyState("Никого не нашли", "Попробуйте ослабить фильтры.");
      observeReveal(list);
    } catch (err) {
      list.innerHTML = emptyState("Не удалось загрузить", err.message);
    }
  };

  search.addEventListener("input", debounce(() => { state.q = search.value; load(); }));
  $("#spec-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.direction = chip.dataset.direction ? [chip.dataset.direction] : [];
    load();
  });
  $(".filters").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "direction" || t.name === "format") state[t.name] = $$(`[name="${t.name}"]:checked`).map((x) => x.value);
    if (t.id === "city") state.city = t.value;
    if (t.id === "kind") state.kind = t.value;
    if (t.id === "available") state.available = t.checked;
    load();
  });
  $("#filters-reset").addEventListener("click", () => {
    Object.assign(state, { q: "", kind: "", direction: [], format: [], city: "", available: false });
    $("#kind").value = "";
    load();
  });
  $("#spec-sort").addEventListener("change", (e) => { state.sort = e.target.value; load(); });
  await load();
}

const checkbox = (name, value) => `<label class="check check--sm"><input type="checkbox" name="${name}" value="${esc(value)}">${esc(value)}</label>`;
