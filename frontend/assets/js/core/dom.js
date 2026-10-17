/** Мелкие DOM-помощники и форматирование. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Экранирование для вставки в HTML-шаблоны. */
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

/** plural(5, ["проект", "проекта", "проектов"]) → "проектов" */
export const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const countLabel = (n, forms) => `${n} ${plural(n, forms)}`;

export const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// «Дизайнер» → «Ищем дизайнера», «Мобильный разработчик» → «Ищем мобильного разработчика»
const genitive = (word) => {
  if (!/[а-яё]/i.test(word)) return word;
  const w = word.toLowerCase();
  if (/(ый|ой)$/.test(w)) return w.replace(/(ый|ой)$/, "ого");
  if (/ий$/.test(w)) return w.replace(/ий$/, "его");
  return /[бвгджзклмнпрстфхцчшщ]$/.test(w) ? w + "а" : w;
};
export const seeking = (role) => "Ищем " + role.trim().split(/\s+/).map((p) => p.split("-").map(genitive).join("-")).join(" ");

/** Параметры запроса из объекта: массивы → повторяющиеся ключи, пустые значения пропускаются. */
export const toQuery = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else if (v !== "" && v != null && v !== false) p.set(k, v);
  });
  return p.toString();
};

/** Последний сегмент пути: /people/anna-mironova → "anna-mironova" */
export const slugFromPath = () => decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
