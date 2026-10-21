/** Фильтры каталога на телефоне: кнопка «Фильтры» рядом с сортировкой открывает их шторкой снизу.
 *  На широком экране те же фильтры стоят на своём месте, шторка не используется. */
import { $, lockScroll } from "../core/dom.js";
import { icon } from "../core/icons.js";

const mobile = () => matchMedia("(max-width: 1100px)").matches;

/**
 * @param {HTMLElement} button кнопка «Фильтры»
 * @param {HTMLElement} sheet блок фильтров
 * @param {{count?: () => number, onReset?: () => void}} opts счётчик активных фильтров для кнопки, сброс
 */
export function initFilterSheet(button, sheet, { count = () => 0, onReset } = {}) {
  sheet.insertAdjacentHTML("afterbegin", `<div class="sheet-head"><strong>Фильтры</strong>
    <button type="button" class="modal__close" style="position:static" data-sheet-close aria-label="Закрыть фильтры">${icon("x")}</button></div>`);
  sheet.insertAdjacentHTML("beforeend", `<div class="sheet-foot">
    ${onReset ? '<button type="button" class="btn btn--outline" data-sheet-reset>Сбросить</button>' : ""}
    <button type="button" class="btn btn--primary" data-sheet-close>Показать</button></div>`);
  let backdrop = null;
  const close = () => {
    if (!sheet.classList.contains("is-open")) return;
    sheet.classList.remove("is-open");
    backdrop?.remove(); backdrop = null;
    lockScroll(false);
    button.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    if (!mobile()) return;
    sheet.classList.add("is-open");
    backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop";
    backdrop.addEventListener("click", close);
    document.body.append(backdrop);
    lockScroll(true);
    button.setAttribute("aria-expanded", "true");
  };
  button.addEventListener("click", open);
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-sheet-close]")) close();
    if (e.target.closest("[data-sheet-reset]")) onReset?.();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  addEventListener("resize", () => { if (!mobile()) close(); });
  const refresh = () => {
    const n = count();
    $(".filters-btn__count", button).textContent = n ? n : "";
    $(".filters-btn__count", button).dataset.n = n;
  };
  refresh();
  return { refresh, close };
}

export const filtersButton = () =>
  `<button type="button" class="btn btn--outline filters-btn" aria-expanded="false" aria-label="Фильтры">${icon("filter")}<span class="filters-btn__label">Фильтры</span><span class="count-badge filters-btn__count" style="position:static;box-shadow:none"></span></button>`;
