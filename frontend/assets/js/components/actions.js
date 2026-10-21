/** Общие действия по data-action (делегирование на document): лайк, избранное, приглашение, сообщение,
 *  отклик на проект, создание и редактирование проекта, жалоба. Работают на любой странице. */
import { api, get, post } from "../core/api.js";
import { $, cleanRoles, compressImage, esc } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { clearErrorsOnInput, openModal, showFieldErrors } from "./modal.js";
import { initPickers, pickerHtml } from "./picker.js";
import { projectUrl } from "./cards.js";

const handleError = (err) => (err.status === 401 ? requireAuth() : toast(err.message, "err"));

/** Отправка формы в модалке: блокировка кнопки, ошибки по полям, закрытие при успехе. */
export function bindModalForm(m, submit, onDone) {
  const form = $("form", m.el);
  clearErrorsOnInput(form);
  $("[data-cancel]", form)?.addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form), err = $(".form-error", form);
    if (err) err.textContent = "";
    btn.disabled = true;
    try {
      const res = await submit(form.elements, form);
      m.close();
      onDone(res);
    } catch (ex) {
      if (ex.status === 422) showFieldErrors(form, ex.errors);
      if (!Object.keys(ex.errors || {}).length) {
        if (err && ex.status !== 401) err.textContent = ex.message;
        else handleError(ex);
      }
    } finally { btn.disabled = false; }
  });
}

export const field = (name, label, control, hint = "") =>
  `<div class="field"><label class="field__label" for="f-${name}">${label}</label>${control}${hint ? `<div class="field__hint">${hint}</div>` : ""}<div class="field__error" data-error="${name}"></div></div>`;
export const actionsRow = (submitText, danger = "") =>
  `<div class="form-error"></div><div class="modal__actions">${danger}<button type="button" class="btn btn--outline" data-cancel>Отмена</button><button type="submit" class="btn btn--primary">${submitText}</button></div>`;

/** Поле загрузки картинки с предпросмотром; итоговый data URL лежит в input[type=hidden]. */
export function imageField(name, label, current = "", hint = "JPG, PNG или WebP. Картинка сожмётся перед отправкой.") {
  return `<div class="field upload" data-upload>
    <span class="field__label">${label}</span>
    <div class="upload__box">
      <div class="upload__preview" ${current ? `style="background-image:url('${esc(current)}')"` : ""}>${current ? "" : icon("image")}</div>
      <div class="upload__actions">
        <label class="btn btn--sm btn--outline">${icon("upload", "sm")}Выбрать файл<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
        <button type="button" class="btn btn--sm btn--ghost-danger" data-upload-clear ${current ? "" : "hidden"}>Убрать</button>
        <div class="field__hint">${hint}</div>
      </div>
    </div>
    <input type="hidden" name="${name}" value="">
    <input type="hidden" name="${name}_remove" value="">
    <div class="field__error" data-error="${name}"></div>
  </div>`;
}

export function initUploads(root, max = 1600) {
  root.querySelectorAll("[data-upload]:not([data-ready])").forEach((box) => {
    box.dataset.ready = "1";
    const file = $("input[type=file]", box), [data, remove] = box.querySelectorAll("input[type=hidden]");
    const preview = $(".upload__preview", box), clear = $("[data-upload-clear]", box), err = $(".field__error", box);
    file.addEventListener("change", async () => {
      err.textContent = "";
      try {
        const url = await compressImage(file.files[0], max);
        data.value = url; remove.value = "";
        preview.style.backgroundImage = `url('${url}')`;
        preview.innerHTML = "";
        clear.hidden = false;
      } catch (ex) { err.textContent = ex.message; }
      file.value = "";
    });
    clear.addEventListener("click", () => {
      data.value = ""; remove.value = "1";
      preview.style.backgroundImage = "";
      preview.innerHTML = icon("image");
      clear.hidden = true;
    });
  });
}

/** Форма проекта: создание (p = null) или редактирование. */
export async function openProjectForm(p = null) {
  if (!(await requireAuth())) return;
  const meta = await get("/api/projects/meta");
  const options = (list, value) => list.map((v) => `<option ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("");
  const d = p?.details || {};
  const m = openModal(`
    <h2 class="modal__title">${p ? "Редактировать проект" : "Новый проект"}</h2>
    <p class="modal__sub">${p ? "Изменения сразу появятся на странице проекта." : "Расскажите об идее — и соберите под неё команду."}</p>
    <form novalidate>
      ${imageField("cover_data", "Обложка", p?.cover || "")}
      ${field("title", "Название", `<input class="input" id="f-title" name="title" maxlength="80" required value="${esc(p?.title || "")}">`)}
      ${field("description", "Коротко о проекте", `<textarea class="input" id="f-description" name="description" maxlength="400" required>${esc(p?.description || "")}</textarea>`)}
      ${p ? field("about", "Подробное описание", `<textarea class="input" id="f-about" name="about" maxlength="3000" style="height:9rem">${esc((d.about || []).join("\n\n"))}</textarea>`, "Абзацы разделяйте пустой строкой.") : ""}
      <div class="field"><span class="field__label">Направление</span>
        ${pickerHtml("category", meta.categories, p ? [p.category] : [], { single: true, placeholder: "Найти направление или добавить своё" })}
        <div class="field__error" data-error="category"></div></div>
      ${field("stage", "Стадия", `<select class="select" id="f-stage" name="stage">${options(meta.stages, p?.stage)}</select>`)}
      ${field("roles", "Кого ищете (через запятую)", `<input class="input" id="f-roles" name="roles" placeholder="Дизайнер, Разработчик" value="${esc((p?.roles || []).join(", "))}">`,
        'Каждая роль публикуется с заглавной буквы: <span data-roles-preview class="muted"></span>')}
      <div class="field"><label class="check check--sm"><input type="checkbox" name="beta" ${p?.beta ? "checked" : ""}> Есть бета-версия</label></div>
      ${p ? `
        <div class="field"><label class="check check--sm"><input type="checkbox" name="closed" ${p.closed ? "checked" : ""}> Проект завершён (закрыт для откликов)</label></div>
        <h3 class="title-sm" style="margin-top:1.5rem">Приватность</h3>
        ${field("team_visibility", "Кого из команды видят посетители", `<select class="select" id="f-team_visibility" name="team_visibility">
          ${[["all", "Всех участников"], ["selected", "Только отмеченных в составе команды"], ["hidden", "Никого — команда скрыта"]]
            .map(([v, l]) => `<option value="${v}" ${p.team_visibility === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        <div class="field"><label class="check check--sm"><input type="checkbox" name="show_team_count" ${p.show_team_count !== false ? "checked" : ""}> Показывать количество участников</label></div>
        ${field("blog_visibility", "Кто читает ленту проекта", `<select class="select" id="f-blog_visibility" name="blog_visibility">
          <option value="all" ${p.blog_visibility !== "members" ? "selected" : ""}>Все посетители</option>
          <option value="members" ${p.blog_visibility === "members" ? "selected" : ""}>Только участники проекта</option></select>`)}` : ""}
      ${actionsRow(p ? "Сохранить" : "Опубликовать")}
    </form>`);
  const form = $("form", m.el);
  initPickers(form);
  initUploads(form);
  const preview = () => { $("[data-roles-preview]", form).textContent = cleanRoles(form.elements.roles.value).join(", ") || "—"; };
  form.elements.roles.addEventListener("input", preview);
  preview();
  bindModalForm(m, (f, fm) => {
    const category = fm.querySelector('[name="category"]:checked')?.value || "";
    if (!category) throw Object.assign(new Error("Выберите направление"), { status: 422, errors: { category: "Выберите направление или добавьте своё" } });
    const body = {
      title: f.title.value, description: f.description.value, category, stage: f.stage.value,
      roles: cleanRoles(f.roles.value), beta: f.beta.checked, cover_data: f.cover_data.value,
    };
    if (!p) return post("/api/projects", body);
    return api(`/api/projects/${encodeURIComponent(p.slug)}`, { method: "PUT", body: {
      ...body, about: f.about.value, closed: f.closed.checked, remove_cover: f.cover_data_remove.value === "1",
      team_visibility: f.team_visibility.value, show_team_count: f.show_team_count.checked, blog_visibility: f.blog_visibility.value,
    } });
  }, (res) => {
    if (p) { toast("Проект сохранён", "ok"); document.dispatchEvent(new CustomEvent("project:updated", { detail: res })); return; }
    toast(res.status === "approved" ? `Проект «${res.title}» опубликован` : `Проект «${res.title}» отправлен на модерацию`, "ok");
    setTimeout(() => (location.href = projectUrl(res)), 700);
  });
}

export async function openInvite(slug, name) {
  if (!(await requireAuth())) return;
  const mine = await get("/api/projects?mine=true&limit=50").catch(() => ({ items: [] }));
  const m = openModal(`
    <h2 class="modal__title">Пригласить в проект</h2>
    <p class="modal__sub">Получатель: <strong>${esc(name)}</strong>. Приглашение придёт в сообщения.</p>
    <form novalidate>
      ${mine.items.length ? field("project", "Проект", `<select class="select" id="f-project" name="project">${mine.items.map((p) => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join("")}</select>`)
        : '<div class="notice">У вас пока нет своих проектов — можно просто написать сообщение или <a href="#" data-action="create-project">создать проект</a>.</div>'}
      ${field("message", "Сообщение", '<textarea class="input" id="f-message" name="message" maxlength="1000" placeholder="Здравствуйте! Хотим пригласить вас…"></textarea>')}
      ${actionsRow("Отправить")}
    </form>`);
  bindModalForm(m, (f) => post(`/api/specialists/${encodeURIComponent(slug)}/invite`, { message: f.message.value, project_slug: f.project?.value || "" }),
    (r) => { toast("Приглашение отправлено", "ok"); if (r.conversation_id) setTimeout(() => (location.href = `/messages?c=${r.conversation_id}`), 600); });
}

/** «Написать»: открывает диалог с владельцем анкеты (или начинает новый). */
export async function openMessage(slug) {
  if (!(await requireAuth())) return;
  location.href = `/messages?to=${encodeURIComponent(slug)}`;
}

export async function openApply(slug, title, roles = [], preselect = "") {
  if (!(await requireAuth())) return;
  const opts = ['<option value="">Любая роль</option>', ...roles.map((r) => `<option ${r === preselect ? "selected" : ""}>${esc(r)}</option>`)].join("");
  const m = openModal(`
    <h2 class="modal__title">Откликнуться</h2>
    <p class="modal__sub">Проект «${esc(title)}». Автор увидит ваш профиль и сообщение, переписка продолжится в сообщениях.</p>
    <form novalidate>
      ${roles.length ? field("role", "Роль", `<select class="select" id="f-role" name="role">${opts}</select>`) : ""}
      ${field("message", "О себе и почему этот проект", '<textarea class="input" id="f-message" name="message" maxlength="1000"></textarea>')}
      ${actionsRow("Отправить отклик")}
    </form>`);
  bindModalForm(m, (f) => post(`/api/projects/${encodeURIComponent(slug)}/apply`, { role: f.role?.value || "", message: f.message.value }),
    (r) => {
      toast("Отклик отправлен — статус виден в «Мои отклики»", "ok");
      document.dispatchEvent(new CustomEvent("project:applied", { detail: r }));
      dispatchEvent(new CustomEvent("sreda:counts"));
    });
}

const REPORT_REASONS = [["plagiarism", "Плагиат или чужие работы"], ["inappropriate", "Недопустимый контент"], ["spam", "Спам или реклама"],
  ["fraud", "Мошенничество"], ["fake", "Выдаёт себя за другого"], ["other", "Другое"]];
const REPORT_TARGETS = { profile: "профиль", org: "организацию", project: "проект", post: "запись" };

export async function openReport(type, slug, title) {
  if (!(await requireAuth())) return;
  const m = openModal(`
    <h2 class="modal__title">Пожаловаться</h2>
    <p class="modal__sub">Жалоба на ${REPORT_TARGETS[type] || "материал"} «${esc(title)}». Её увидят только модераторы, автор не узнает, кто её отправил.</p>
    <form novalidate>
      <div class="field"><span class="field__label">Причина</span><div class="report-reasons">
        ${REPORT_REASONS.map(([v, l], i) => `<label class="check check--sm"><input type="radio" name="reason" value="${v}" ${i ? "" : "checked"}>${l}</label>`).join("")}
      </div><div class="field__error" data-error="reason"></div></div>
      ${field("comment", "Подробности", '<textarea class="input" id="f-comment" name="comment" maxlength="1000" placeholder="Например, ссылка на оригинал работы"></textarea>')}
      ${actionsRow("Отправить жалобу")}
    </form>`);
  bindModalForm(m, (f, form) => post("/api/reports", {
    target_type: type === "org" ? "profile" : type, target_slug: String(slug),
    reason: form.querySelector("[name=reason]:checked").value, comment: f.comment.value,
  }), () => toast("Спасибо! Модератор рассмотрит жалобу", "ok"));
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
  invite: (b) => openInvite(b.dataset.slug, b.dataset.name),
  message: (b) => openMessage(b.dataset.slug),
  report: (b) => openReport(b.dataset.type, b.dataset.slug, b.dataset.title),
  "create-project": () => openProjectForm(),
};

export function initActions() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !HANDLERS[btn.dataset.action]) return;
    e.preventDefault();
    btn.closest(".modal-backdrop")?.querySelector(".modal__close")?.click();
    HANDLERS[btn.dataset.action](btn);
  });
}

