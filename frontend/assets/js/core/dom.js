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

/** Блокировка прокрутки страницы под меню и модальными окнами. Вызовы считаются: lockScroll(true) дважды → нужно дважды снять. */
let locks = 0;
export function lockScroll(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.documentElement.classList.toggle("is-locked", locks > 0);
}

/** «Дизайнер, motion-дизайнер» → ["Дизайнер", "Motion-дизайнер"]: роли публикуются с заглавной буквы, без повторов. */
export const cleanRoles = (value) => [...new Set((Array.isArray(value) ? value : String(value || "").split(","))
  .map((r) => r.trim().replace(/\s+/g, " ")).filter(Boolean).map(capFirst))];

/** Относительное время: «только что», «5 мин назад», «вчера в 14:20», «12 мар». */
export function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
  const s = (Date.now() - d) / 1000;
  if (s < 60) return "только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(d)) / 864e5);
  if (days === 0) return `сегодня в ${time}`;
  if (days === 1) return `вчера в ${time}`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(days > 300 ? { year: "numeric" } : {}) });
}

/** Сжатие картинки в браузере перед отправкой: длинная сторона ≤ max, JPEG/WebP. Возвращает data URL. */
export function compressImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("Выберите файл изображения")); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error("Файл больше 15 МБ")); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * k);
      canvas.height = Math.round(img.naturalHeight * k);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const webp = canvas.toDataURL("image/webp", quality);
      resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось прочитать изображение")); };
    img.src = url;
  });
}
