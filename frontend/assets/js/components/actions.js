/** Общие действия по data-action (делегирование на document): лайк, избранное,
 *  приглашение, отклик на проект, создание проекта. Работают на любой странице. */
import { get, post } from "../core/api.js";
import { $, esc } from "../core/dom.js";
import { requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { clearErrorsOnInput, openModal, showFieldErrors } from "./modal.js";
import { projectUrl } from "./cards.js";

const handleError = (err) => (err.status === 401 ? requireAuth() : toast(err.message, "err"));

/** Отправка формы в модалке: блокировка кнопки, ошибки по полям, закрытие при успехе. */
function bindModalForm(m, submit, onDone) {
  const form = $("form", m.el);
  clearErrorsOnInput(form);
  $("[data-cancel]", form)?.addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try {
      const res = await submit(form.elements);
      m.close();
      onDone(res);
    } catch (err) {
      if (err.status === 422) showFieldErrors(form, err.errors);
      if (!Object.keys(err.errors || {}).length) handleError(err);
    } finally { btn.disabled = false; }
  });
}

const field = (name, label, control) =>
  `<div class="field"><label class="field__label" for="f-${name}">${label}</label>${control}<div class="field__error" data-error="${name}"></div></div>`;
const actionsRow = (submitText) =>
  `<div class="modal__actions"><button type="button" class="btn btn--outline" data-cancel>Отмена</button><button type="submit" class="btn btn--primary">${submitText}</button></div>`;

export async function openCreateProject() {
  if (!(await requireAuth())) return;
  const meta = await get("/api/projects/meta");
  const options = (list) => list.map((v) => `<option>${esc(v)}</option>`).join("");
  const m = openModal(`
    <h2 class="modal__title">Новый проект</h2>
    <p class="modal__sub">Расскажите об идее — и соберите под неё команду.</p>
    <form novalidate>
      ${field("title", "Название", '<input class="input" id="f-title" name="title" maxlength="80" required>')}
      ${field("description", "Описание", '<textarea class="input" id="f-description" name="description" maxlength="400" required></textarea>')}
      <div class="grid-2">
        ${field("category", "Направление", `<select class="select" id="f-category" name="category">${options(meta.categories)}</select>`)}
        ${field("stage", "Стадия", `<select class="select" id="f-stage" name="stage">${options(meta.stages)}</select>`)}
      </div>
      ${field("roles", "Кого ищете (через запятую)", '<input class="input" id="f-roles" name="roles" placeholder="Дизайнер, Разработчик">')}
      <div class="field"><label class="check check--sm"><input type="checkbox" name="beta"> Есть бета-версия</label></div>
      ${actionsRow("Опубликовать")}
    </form>`);
  bindModalForm(m, (f) => post("/api/projects", {
    title: f.title.value, description: f.description.value, category: f.category.value, stage: f.stage.value,
    roles: f.roles.value.split(",").map((s) => s.trim()).filter(Boolean), beta: f.beta.checked,
  }), (p) => {
    toast(p.status === "approved" ? `Проект «${p.title}» опубликован` : `Проект «${p.title}» отправлен на модерацию`, "ok");
    setTimeout(() => (location.href = projectUrl(p)), 700);
  });
}

const INVITE_TITLES = { invite: "Пригласить в проект", discuss: "Обсудить проект", message: "Написать сообщение" };

export async function openInvite(slug, name, mode = "invite") {
  if (!(await requireAuth())) return;
  const m = openModal(`
    <h2 class="modal__title">${INVITE_TITLES[mode] || INVITE_TITLES.invite}</h2>
    <p class="modal__sub">Получатель: <strong>${esc(name)}</strong></p>
    <form novalidate>
      ${field("message", "Сообщение", '<textarea class="input" id="f-message" name="message" maxlength="1000" placeholder="Здравствуйте! Хотим пригласить вас…"></textarea>')}
      ${actionsRow("Отправить")}
    </form>`);
  bindModalForm(m, (f) => post(`/api/specialists/${encodeURIComponent(slug)}/invite`, { message: f.message.value }),
    () => toast("Сообщение отправлено", "ok"));
}

export async function openApply(slug, title, roles = [], preselect = "") {
  if (!(await requireAuth())) return;
  const opts = ['<option value="">Любая роль</option>', ...roles.map((r) => `<option ${r === preselect ? "selected" : ""}>${esc(r)}</option>`)].join("");
  const m = openModal(`
    <h2 class="modal__title">Откликнуться</h2>
    <p class="modal__sub">Проект «${esc(title)}». Автор увидит ваш профиль и сообщение.</p>
    <form novalidate>
      ${roles.length ? field("role", "Роль", `<select class="select" id="f-role" name="role">${opts}</select>`) : ""}
      ${field("message", "О себе и почему этот проект", '<textarea class="input" id="f-message" name="message" maxlength="1000"></textarea>')}
      ${actionsRow("Отправить отклик")}
    </form>`);
  bindModalForm(m, (f) => post(`/api/projects/${encodeURIComponent(slug)}/apply`, { role: f.role?.value || "", message: f.message.value }),
    () => { toast("Отклик отправлен — автор свяжется с вами", "ok"); document.dispatchEvent(new CustomEvent("project:applied")); });
}

async function toggleLike(btn) {
  if (!(await requireAuth())) return;
  try {
    const r = await post(`/api/projects/${btn.dataset.id}/like`);
    document.querySelectorAll(`[data-action="like"][data-id="${btn.dataset.id}"]`).forEach((b) => {
      b.classList.toggle("is-on", r.liked);
      b.setAttribute("aria-pressed", r.liked);
      b.querySelector("span").textContent = r.likes;
    });
  } catch (err) { handleError(err); }
}

async function toggleBookmark(btn) {
  if (!(await requireAuth())) return;
  try {
    const r = await post(`/api/specialists/${encodeURIComponent(btn.dataset.slug)}/bookmark`);
    btn.classList.toggle("is-on", r.bookmarked);
    btn.setAttribute("aria-pressed", r.bookmarked);
    toast(r.bookmarked ? "Добавлено в избранное" : "Удалено из избранного");
  } catch (err) { handleError(err); }
}

const HANDLERS = {
  like: toggleLike,
  bookmark: toggleBookmark,
  invite: (b) => openInvite(b.dataset.slug, b.dataset.name, b.dataset.mode),
  "create-project": () => openCreateProject(),
};

export function initActions() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !HANDLERS[btn.dataset.action]) return;
    e.preventDefault();
    HANDLERS[btn.dataset.action](btn);
  });
}
