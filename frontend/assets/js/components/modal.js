/** Модальные окна, ошибки полей формы, лайтбокс для картинок, подтверждение действий. */
import { $, $$, esc, lockScroll } from "../core/dom.js";
import { icon } from "../core/icons.js";

export function openModal(html, { wide = false, onClose } = {}) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `<div class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true">
    <button class="modal__close" type="button" aria-label="Закрыть">${icon("x")}</button>${html}</div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener("keydown", onKey);
    lockScroll(false);
    prevFocus?.focus?.({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  back.addEventListener("click", (e) => e.target === back && close());
  $(".modal__close", back).addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  lockScroll(true);
  document.body.append(back);
  // на телефоне не открываем клавиатуру сразу — она закрывает половину окна
  if (matchMedia("(hover: hover)").matches) $("input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select", back)?.focus();
  return { el: back, close };
}

/** Окно подтверждения. Возвращает Promise<boolean>. */
export function confirmDialog(title, text = "", { ok = "Подтвердить", danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal(`
      <h2 class="modal__title">${esc(title)}</h2>${text ? `<p class="modal__sub">${esc(text)}</p>` : ""}
      <div class="modal__actions"><button type="button" class="btn btn--outline" data-no>Отмена</button>
      <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-yes>${esc(ok)}</button></div>`,
    { onClose: () => resolve(answer) });
    $("[data-no]", m.el).addEventListener("click", m.close);
    $("[data-yes]", m.el).addEventListener("click", () => { answer = true; m.close(); });
  });
}

/** Показать ошибки валидации { поле: сообщение } под полями формы. */
export function showFieldErrors(form, errors = {}) {
  $$("[data-error]", form).forEach((e) => (e.textContent = ""));
  $$(".input", form).forEach((i) => i.classList.remove("is-invalid"));
  Object.entries(errors).forEach(([field, msg]) => {
    const err = $(`[data-error="${field}"]`, form);
    if (err) err.textContent = msg;
    form.elements[field]?.classList?.add("is-invalid");
  });
}

/** Сбрасывает подсветку ошибки, как только пользователь начинает править поле. */
export function clearErrorsOnInput(form) {
  $$(".input", form).forEach((i) => i.addEventListener("input", () => {
    i.classList.remove("is-invalid");
    const err = $(`[data-error="${i.name}"]`, form);
    if (err) err.textContent = "";
  }));
}

export function openLightbox(src, title, meta = "") {
  openModal(`<div class="lightbox"><img src="${esc(src)}" alt="${esc(title)}">
    <div class="lightbox__caption"><strong>${esc(title)}</strong><small>${esc(meta)}</small></div></div>`, { wide: true });
}

/** Лайтбокс с произвольным содержимым (видео, проект из портфолио). */
export function openMediaBox(mediaHtml, title, meta = "", extra = "") {
  openModal(`<div class="lightbox">${mediaHtml}
    <div class="lightbox__caption"><div><strong>${esc(title)}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</div>${extra}</div></div>`, { wide: true });
}
