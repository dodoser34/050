/** Выбор направлений с поиском и возможностью добавить своё.
 *  pickerHtml(...) — разметка, initPickers(root) — поведение. Значения читаются как обычные чекбоксы/радио по name. */
import { $, $$, capFirst, esc } from "../core/dom.js";
import { icon } from "../core/icons.js";

const option = (name, value, checked, type) =>
  `<label class="chip-check"><input type="${type}" name="${esc(name)}" value="${esc(value)}" ${checked ? "checked" : ""}><span>${esc(value)}</span></label>`;

/**
 * @param {string} name имя поля
 * @param {string[]} options варианты из справочника
 * @param {string[]} selected выбранные значения (в том числе свои)
 * @param {{max?: number, single?: boolean, placeholder?: string}} opts
 */
export function pickerHtml(name, options, selected = [], { max = 6, single = false, placeholder = "Найти или добавить своё" } = {}) {
  const all = [...new Set([...selected, ...options])];
  const type = single ? "radio" : "checkbox";
  return `
    <div class="picker" data-picker data-name="${esc(name)}" data-max="${single ? 1 : max}" data-type="${type}">
      <div class="picker__search">
        ${icon("search", "sm")}
        <input class="picker__input" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" maxlength="40" autocomplete="off">
      </div>
      <div class="picker__add" hidden><button type="button" class="btn btn--sm btn--outline" data-picker-add>${icon("plus", "sm")}<span></span></button></div>
      <div class="chips picker__list">${all.map((v) => option(name, v, selected.includes(v), type)).join("")}</div>
      <div class="picker__foot"><span class="picker__count"></span><button type="button" class="picker__more" data-picker-more hidden>Показать все</button></div>
    </div>`;
}

const COLLAPSED = 10; // сколько вариантов видно без поиска

export function initPickers(root = document) {
  $$("[data-picker]:not([data-ready])", root).forEach((box) => {
    box.dataset.ready = "1";
    const input = $(".picker__input", box), list = $(".picker__list", box), addWrap = $(".picker__add", box);
    const more = $("[data-picker-more]", box), count = $(".picker__count", box);
    const max = +box.dataset.max, type = box.dataset.type, name = box.dataset.name;
    let expanded = false;

    const inputs = () => $$("input", list);
    const update = () => {
      const q = input.value.trim().toLocaleLowerCase();
      const checked = inputs().filter((i) => i.checked);
      let shown = 0;
      // выбранные — всегда первыми и всегда видны
      inputs().forEach((i) => {
        const label = i.closest("label");
        const match = !q || i.value.toLocaleLowerCase().includes(q);
        const visible = i.checked || (match && (q || expanded || shown < COLLAPSED));
        if (visible && !i.checked) shown++;
        label.hidden = !visible;
        label.style.order = i.checked ? -1 : 0;
        if (type === "checkbox") i.disabled = !i.checked && checked.length >= max;
      });
      const exact = inputs().some((i) => i.value.toLocaleLowerCase() === q);
      addWrap.hidden = !q || q.length < 2 || exact;
      $("span", addWrap).textContent = `Добавить «${capFirst(input.value.trim())}»`;
      const hiddenCount = inputs().filter((i) => !i.checked && (!q || i.value.toLocaleLowerCase().includes(q))).length - shown;
      more.hidden = Boolean(q) || expanded || hiddenCount <= 0;
      more.textContent = `Показать все (${inputs().length})`;
      count.textContent = type === "checkbox" ? `Выбрано ${checked.length} из ${max}` : "";
    };
    const add = () => {
      const value = capFirst(input.value.trim().replace(/\s+/g, " "));
      if (value.length < 2) return;
      const existing = inputs().find((i) => i.value.toLocaleLowerCase() === value.toLocaleLowerCase());
      if (existing) existing.checked = true;
      else {
        if (type === "checkbox" && inputs().filter((i) => i.checked).length >= max) return;
        list.insertAdjacentHTML("afterbegin", option(name, value, true, type));
      }
      input.value = "";
      update();
      box.dispatchEvent(new Event("change", { bubbles: true }));
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    $("[data-picker-add]", box).addEventListener("click", add);
    more.addEventListener("click", () => { expanded = true; box.classList.add("is-expanded"); update(); });
    list.addEventListener("change", update);
    update();
  });
}

export const pickedValues = (form, name) => $$(`[name="${name}"]:checked`, form).map((x) => x.value);
