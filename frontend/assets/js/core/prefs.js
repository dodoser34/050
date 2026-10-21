/** Настройки оформления этого браузера: тема и уровень анимаций. Хранятся в localStorage,
 *  применяются атрибутами html[data-theme] и html[data-motion] (первый раз — в assets/js/boot.js). */

const KEY = "sreda:prefs";
const mq = (q) => matchMedia(q).matches;

export const THEMES = [["light", "Светлая", "sun"], ["dark", "Тёмная", "moon"], ["auto", "Как в системе", "monitor"]];
export const MOTIONS = [["full", "Все"], ["calm", "Спокойные"], ["off", "Выключены"]];

export function readPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}

/** Выбор пользователя: light | dark | auto */
export const themeChoice = () => readPrefs().theme || "auto";
/** Выбор пользователя: full | calm | off (по умолчанию — спокойные, а при системной настройке «меньше движения» — выключены) */
export const motionChoice = () => readPrefs().motion || (mq("(prefers-reduced-motion: reduce)") ? "off" : "calm");
/** Действующий уровень анимаций */
export const motionLevel = () => document.documentElement.dataset.motion || motionChoice();

function apply() {
  const d = document.documentElement, choice = themeChoice();
  const theme = choice === "auto" ? (mq("(prefers-color-scheme: dark)") ? "dark" : "light") : choice;
  d.dataset.theme = theme;
  d.dataset.motion = motionChoice();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121116" : "#fffbf5");
  swapThemeImages();
  dispatchEvent(new CustomEvent("sreda:prefs"));
}

/** Иллюстрации с тёмной парой: <img src="…/about.webp" data-dark="…/about-dark.webp">.
 *  В тёмной теме сразу ставится тёмная версия (prompts/images-dark.prompt); если её нет —
 *  core/placeholders.js возвращает светлую. */
export function swapThemeImages(root = document) {
  const dark = document.documentElement.dataset.theme === "dark";
  root.querySelectorAll("img[data-dark]").forEach((img) => {
    img.dataset.light ??= img.getAttribute("src");
    const want = dark && img.dataset.darkMissing !== "1" ? img.dataset.dark : img.dataset.light;
    if (img.getAttribute("src") !== want) img.src = want;
  });
}

export function setPref(key, value) {
  const prefs = readPrefs();
  prefs[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* приватный режим: действует до перезагрузки */ }
  apply();
}

export function initPrefs() {
  apply();
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => themeChoice() === "auto" && apply());
  // настройки, изменённые в другой вкладке
  addEventListener("storage", (e) => e.key === KEY && apply());
}

/** Сегментированный переключатель для темы или анимаций. */
export function prefSwitch(kind) {
  const [items, current] = kind === "theme" ? [THEMES, themeChoice()] : [MOTIONS, motionChoice()];
  return `<div class="seg" role="group" data-pref="${kind}" aria-label="${kind === "theme" ? "Тема" : "Анимации"}">${items.map(([value, label]) =>
    `<button type="button" data-value="${value}" aria-pressed="${value === current}">${label}</button>`).join("")}</div>`;
}

/** Делегирование кликов по любым переключателям [data-pref] на странице. */
export function bindPrefSwitches(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pref] button[data-value]");
    if (!btn) return;
    const group = btn.closest("[data-pref]");
    setPref(group.dataset.pref, btn.dataset.value);
    document.querySelectorAll(`[data-pref="${group.dataset.pref}"] button`).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.value === btn.dataset.value)));
  });
}
