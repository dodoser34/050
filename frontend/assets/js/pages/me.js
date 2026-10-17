/** Личный кабинет: анкета специалиста/студии (уходит на модерацию) и мои проекты со статусами. */
import { get, api } from "../core/api.js";
import { $, $$, esc } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { currentUser, requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { moderationNotice, personUrl, projectUrl, statusBadge } from "../components/cards.js";
import { clearErrorsOnInput, showFieldErrors } from "../components/modal.js";
import { observeReveal } from "../components/reveal.js";

const FORMATS = ["Удалённо", "Гибрид", "Офис"];
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

export async function init() {
  const root = $("#cabinet");
  if (!(await requireAuth())) return;
  const user = currentUser();
  const [{ profile, directions }, mine] = await Promise.all([get("/api/me/profile"), get("/api/projects?mine=true&limit=50")]);

  root.innerHTML = `
    <section class="cabinet-head" data-reveal>
      <div>
        <p class="eyebrow">Личный кабинет</p>
        <h1 class="title-lg" style="margin-top:.5rem">Привет, ${esc(user.name.split(" ")[0])}!</h1>
        <p class="lead" style="margin-top:.75rem">Заполните анкету — после проверки модератором она появится в каталоге специалистов.</p>
      </div>
      ${user.is_admin ? `<a class="btn btn--outline" href="/admin">${icon("shield")}Админ-панель</a>` : ""}
    </section>

    <div class="cabinet">
      <section class="card card--pad cabinet__form" id="profile-card"></section>
      <aside class="cabinet__aside">
        <div class="card card--pad" data-reveal="right">
          <div class="row" style="justify-content:space-between"><h2 class="title-sm">Мои проекты</h2><button class="btn btn--sm btn--primary" data-action="create-project">${icon("plus", "sm")}Создать</button></div>
          <div class="stack" style="--gap:.6rem;margin-top:1rem">
            ${mine.items.length ? mine.items.map((p) => `
              <a class="my-item" href="${projectUrl(p)}">
                ${imgTag(p.cover, "cover", p.title)}
                <div><div class="my-item__title">${esc(p.title)}</div>${statusBadge(p.status)}</div>
              </a>`).join("") : '<p class="muted">Пока нет проектов. Новый проект публикуется после проверки модератором.</p>'}
          </div>
        </div>
        <div class="card card--pad" data-reveal="right" style="--d:.08s">
          <h2 class="title-sm">Как работает модерация</h2>
          <ol class="steps-list">
            <li>Вы заполняете анкету или создаёте проект.</li>
            <li>Модератор проверяет его — обычно в течение дня.</li>
            <li>После одобрения он появляется в каталоге. Если что-то не так, вы увидите причину и сможете исправить.</li>
          </ol>
        </div>
      </aside>
    </div>`;

  renderProfile($("#profile-card"), profile, directions);
  observeReveal(root);
}

function renderProfile(card, profile, directions) {
  const p = profile || {};
  const d = p.details || {};
  const tg = (d.contacts || []).find((c) => c.label === "Telegram")?.url || "";
  const site = (d.contacts || []).find((c) => c.label === "Сайт")?.url || "";
  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h2 class="title">Анкета специалиста</h2>
      ${profile ? `<div class="row" style="--gap:.6rem">${statusBadge(p.status)}${p.status === "approved" ? `<a class="btn btn--sm btn--outline" href="${personUrl(p.slug)}">Открыть анкету</a>` : `<a class="btn btn--sm btn--ghost" href="${personUrl(p.slug)}">Предпросмотр</a>`}</div>` : ""}
    </div>
    ${profile ? moderationNotice(p.status, p.moderation_note, "анкету") : '<div class="notice">Анкеты ещё нет. Заполните форму — и отправьте на проверку.</div>'}

    <form id="profile-form" novalidate>
      <div class="segmented" role="radiogroup" aria-label="Тип анкеты">
        <label><input type="radio" name="kind" value="person" ${p.kind !== "studio" ? "checked" : ""}><span>${icon("users", "sm")}Я специалист</span></label>
        <label><input type="radio" name="kind" value="studio" ${p.kind === "studio" ? "checked" : ""}><span>${icon("folder", "sm")}Мы студия / команда</span></label>
      </div>

      <div class="form-grid">
        ${field("name", "Имя или название", `<input class="input" id="f-name" name="name" value="${esc(p.name || "")}" maxlength="80" placeholder="Анна Миронова">`)}
        ${field("role", "Специализация", `<input class="input" id="f-role" name="role" value="${esc(p.role || "")}" maxlength="80" placeholder="UX/UI-дизайнер">`)}
        ${field("city", "Город", `<input class="input" id="f-city" name="city" value="${esc(p.city || "")}" maxlength="60" placeholder="Москва">`)}
        ${field("tags", "Ключевые теги (через запятую)", `<input class="input" id="f-tags" name="tags" value="${esc((p.tags || []).join(", "))}" placeholder="Figma, Веб-дизайн">`)}
      </div>

      <div class="field"><span class="field__label">Направления</span>
        <div class="chips">${directions.map((x) => `<label class="chip-check"><input type="checkbox" name="directions" value="${esc(x)}" ${(p.directions || []).includes(x) ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
        <div class="field__error" data-error="directions"></div>
      </div>
      <div class="field"><span class="field__label">Формат работы</span>
        <div class="chips">${FORMATS.map((x) => `<label class="chip-check"><input type="checkbox" name="formats" value="${x}" ${(p.formats || []).includes(x) ? "checked" : ""}><span>${x}</span></label>`).join("")}</div>
      </div>

      ${field("bio", "О себе", `<textarea class="input" id="f-bio" name="bio" maxlength="1200" placeholder="Чем занимаетесь, с кем работали, что умеете лучше всего">${esc(d.bio || "")}</textarea>`, "Минимум 20 символов. Первое предложение станет подзаголовком карточки.")}
      ${field("skills", "Навыки (через запятую)", `<input class="input" id="f-skills" name="skills" value="${esc((d.skills || []).join(", "))}" placeholder="Figma, Прототипирование, Дизайн-системы">`)}

      <div class="form-grid">
        ${field("telegram", "Telegram", `<input class="input" id="f-telegram" name="telegram" value="${esc(tg)}" placeholder="@username">`)}
        ${field("website", "Сайт или портфолио", `<input class="input" id="f-website" name="website" value="${esc(site)}" placeholder="https://…">`)}
      </div>

      <div class="field"><span class="field__label">Портфолио</span>
        <div class="rows" id="portfolio-rows">${(d.portfolio || []).map(workRow).join("")}</div>
        <button type="button" class="btn btn--sm btn--ghost" data-add="portfolio">${icon("plus", "sm")}Добавить работу</button>
      </div>
      <div class="field"><span class="field__label">Опыт</span>
        <div class="rows" id="experience-rows">${(d.experience || []).map(expRow).join("")}</div>
        <button type="button" class="btn btn--sm btn--ghost" data-add="experience">${icon("plus", "sm")}Добавить место работы</button>
      </div>

      <div class="field"><label class="check check--sm"><input type="checkbox" name="open" ${p.open === false ? "" : "checked"}>Открыт(а) к новым проектам</label></div>

      <div class="form-error"></div>
      <div class="row" style="margin-top:1.5rem;justify-content:flex-end">
        <button type="submit" class="btn btn--primary btn--lg">${profile ? "Сохранить и отправить на проверку" : "Отправить на проверку"}</button>
      </div>
    </form>`;

  const form = $("#profile-form", card);
  clearErrorsOnInput(form);
  form.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) $(`#${add.dataset.add}-rows`, card).insertAdjacentHTML("beforeend", add.dataset.add === "portfolio" ? workRow() : expRow());
    const del = e.target.closest("[data-remove]");
    if (del) del.closest(".rows__item").remove();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements, btn = $("button[type=submit]", form), err = $(".form-error", form);
    err.textContent = "";
    const rows = (sel, keys) => $$(sel, form).map((r) => Object.fromEntries(keys.map((k) => [k, $(`[data-k="${k}"]`, r).value.trim()]))).filter((x) => x[keys[0]]);
    const body = {
      kind: $("[name=kind]:checked", form).value,
      name: f.name.value, role: f.role.value, city: f.city.value,
      tags: list(f.tags.value), skills: list(f.skills.value), bio: f.bio.value,
      directions: $$("[name=directions]:checked", form).map((x) => x.value),
      formats: $$("[name=formats]:checked", form).map((x) => x.value),
      telegram: f.telegram.value.trim(), website: f.website.value.trim(), open: f.open.checked,
      portfolio: rows("#portfolio-rows .rows__item", ["title", "meta"]),
      experience: rows("#experience-rows .rows__item", ["place", "role", "period"]),
    };
    btn.disabled = true;
    try {
      if (!(await requireAuth())) return;
      const { profile: saved } = await api("/api/me/profile", { method: "PUT", body });
      toast(saved.status === "approved" ? "Анкета сохранена и опубликована" : "Анкета отправлена на модерацию", "ok");
      renderProfile(card, saved, directions);
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (ex) {
      showFieldErrors(form, ex.errors);
      if (ex.errors?.directions) $("[data-error=directions]", form).textContent = "Выберите хотя бы одно направление";
      if (!Object.keys(ex.errors || {}).length || ex.errors.title || ex.errors.place) err.textContent = ex.errors?.title || ex.errors?.place ? "Проверьте строки портфолио и опыта: название — минимум 2 символа" : ex.message;
    } finally { btn.disabled = false; }
  });
}

const field = (name, label, control, hint = "") =>
  `<div class="field"><label class="field__label" for="f-${name}">${label}</label>${control}${hint ? `<div class="field__hint">${hint}</div>` : ""}<div class="field__error" data-error="${name}"></div></div>`;

const workRow = (w = {}) => `
  <div class="rows__item">
    <input class="input" data-k="title" value="${esc(w.title || "")}" placeholder="Название работы" maxlength="80" aria-label="Название работы">
    <input class="input" data-k="meta" value="${esc(w.meta || "")}" placeholder="Тип · год" maxlength="80" aria-label="Тип и год">
    <button type="button" class="icon-btn" data-remove aria-label="Удалить">${icon("x", "sm")}</button>
  </div>`;

const expRow = (x = {}) => `
  <div class="rows__item rows__item--3">
    <input class="input" data-k="place" value="${esc(x.place || "")}" placeholder="Компания или проект" maxlength="80" aria-label="Компания">
    <input class="input" data-k="role" value="${esc(x.role || "")}" placeholder="Роль" maxlength="80" aria-label="Роль">
    <input class="input" data-k="period" value="${esc(x.period || "")}" placeholder="2023 — 2026" maxlength="40" aria-label="Период">
    <button type="button" class="icon-btn" data-remove aria-label="Удалить">${icon("x", "sm")}</button>
  </div>`;
