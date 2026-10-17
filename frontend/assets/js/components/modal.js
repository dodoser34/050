/** Модальные окна, ошибки полей формы, лайтбокс для картинок. */
import { $, $$, esc } from "../core/dom.js";
import { icon } from "../core/icons.js";

export function openModal(html, { wide = false } = {}) {
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `<div class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true">
    <button class="modal__close" aria-label="Закрыть">${icon("x")}</button>${html}</div>`;
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = "";
    prevFocus?.focus?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  back.addEventListener("click", (e) => e.target === back && close());
  $(".modal__close", back).addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  document.body.append(back);
  $("input, textarea, select", back)?.focus();
  return { el: back, close };
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
