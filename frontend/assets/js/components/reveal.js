/** Анимации интерфейса: появление при скролле, заголовки по словам, счётчики. */
import { $$ } from "../core/dom.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let observer = null;

/** Подключает появление ко всем [data-reveal], .split-words и [data-count] внутри root. Можно вызывать повторно для новых элементов. */
export function observeReveal(root = document) {
  if (reduce) {
    $$("[data-reveal], .split-words", root).forEach((el) => el.classList.add("is-visible"));
    $$("[data-count]", root).forEach((el) => (el.textContent = el.dataset.count));
    return;
  }
  observer ??= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-visible");
      if (e.target.dataset.count) countUp(e.target);
      observer.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  $$(".split-words", root).forEach(splitWords);
  $$("[data-reveal]:not(.is-visible), .split-words:not(.is-visible)", root).forEach((el) => observer.observe(el));
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
  const target = +el.dataset.count, start = performance.now(), dur = 1400;
  const step = () => {
    const p = Math.min(1, Math.max(0, (performance.now() - start) / dur));
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => (el.textContent = target), dur + 200); // итог гарантирован, даже если кадры не идут
}

