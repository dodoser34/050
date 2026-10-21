/** Анимации интерфейса: появление при скролле, заголовки по словам, счётчики.
 *  Уровень берётся из настроек (core/prefs.js): full — всё, calm — короткое проявление, off — без анимаций. */
import { $$ } from "../core/dom.js";
import { motionLevel } from "../core/prefs.js";

let observer = null;

/** Подключает появление ко всем [data-reveal], .split-words и [data-count] внутри root. Можно вызывать повторно для новых элементов. */
export function observeReveal(root = document) {
  const level = motionLevel();
  if (level === "off") {
    $$("[data-reveal], .split-words", root).forEach((el) => el.classList.add("is-visible"));
    $$("[data-count]", root).forEach((el) => { el.dataset.counted = "1"; el.textContent = el.dataset.count; });
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-visible");
      if (e.target.dataset.count) countUp(e.target);
      observer.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  // по словам заголовки «выезжают» только в режиме «все анимации»
  $$(".split-words:not(.is-visible)", root).forEach((el) => (level === "full" ? splitWords(el) : el.classList.add("is-visible")));
  $$("[data-reveal]:not(.is-visible), .split-words:not(.is-visible)", root).forEach((el) => {
    // в спокойном режиме то, что уже на экране (в том числе после перезагрузки посреди страницы), показываем сразу —
    // проявляется только то, до чего пользователь докрутит
    if (level !== "full" && inViewport(el)) el.classList.add("is-visible");
    else observer.observe(el);
  });
  // счётчики: если уже на экране — считаем сразу, иначе ждём появления
  $$("[data-count]:not([data-counted])", root).forEach((el) => (inViewport(el) ? countUp(el) : observer.observe(el)));
}

const inViewport = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
};

/** Разбивает заголовок на слова, чтобы они «выезжали» по очереди. <br> сохраняются. */
function splitWords(el) {
  if (el.dataset.split) return;
  el.dataset.split = "1";
  let i = 0;
  el.innerHTML = el.innerHTML.split(/(<br\s*\/?>)/i).map((part) =>
    /^<br/i.test(part) ? part : part.split(/(\s+)/).map((w) =>
      w.trim() ? `<span class="w"><span style="--i:${i++}">${w}</span></span>` : w).join("")).join("");
}

function countUp(el) {
  if (el.dataset.counted) return;
  el.dataset.counted = "1";
  const target = +el.dataset.count;
  if (motionLevel() === "off") { el.textContent = target; return; }
  const start = performance.now(), dur = motionLevel() === "full" ? 1400 : 700;
  const step = () => {
    const p = Math.min(1, Math.max(0, (performance.now() - start) / dur));
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => (el.textContent = target), dur + 200); // итог гарантирован, даже если кадры не идут
}
