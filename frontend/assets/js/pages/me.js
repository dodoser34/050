/** Личный кабинет: анкета специалиста/организации (уходит на модерацию), отклики, уведомления, настройки
 *  (оформление, приватность, видимость проектов), сотрудники организации. Разделы — по адресу #applications, #settings… */
import { get, api, post } from "../core/api.js";
import { $, $$, esc, timeAgo } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { prefSwitch } from "../core/prefs.js";
import { currentUser, requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { applicationBadge, moderationNotice, personUrl, projectUrl, statusBadge } from "../components/cards.js";
import { imageField, initUploads } from "../components/actions.js";
import { notifItem } from "../components/header.js";
import { clearErrorsOnInput, showFieldErrors } from "../components/modal.js";
import { initPickers, pickerHtml, pickedValues } from "../components/picker.js";
import { observeReveal } from "../components/reveal.js";
import { memberSearch } from "./project.js";

const FORMATS = ["Удалённо", "Гибрид", "Офис"];
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
let data, root, tabsEl, panel;

export async function init() {
  root = $("#cabinet");
  if (!(await requireAuth())) return;
  const user = currentUser();
  const [me, mine] = await Promise.all([get("/api/me/profile"), get("/api/projects?mine=true&limit=50")]);
  data = { ...me, mine: mine.items };
  const org = me.profile ? me.profile.kind === "studio" : me.account_type === "org";

  const tabs = [["profile", org ? "Организация" : "Анкета"], ["applications", "Мои отклики"], ["notifications", "Уведомления"],
    ...(org ? [["org", "Сотрудники"]] : []), ["settings", "Настройки"]];
  root.innerHTML = `
    <section class="cabinet-head">
      <div>
        <p class="eyebrow">Личный кабинет</p>
        <h1 class="title-lg" style="margin-top:.5rem">Привет, ${esc(user.name.split(" ")[0])}!</h1>
      </div>
      <div class="row" style="--gap:.5rem">
        <a class="btn btn--outline" href="/messages">${icon("chat")}Сообщения</a>
        ${user.is_admin ? `<a class="btn btn--outline" href="/admin">${icon("shield")}Админ-панель</a>` : ""}
      </div>
    </section>
    <div class="tabs tabs--compact cabinet-tabs" role="tablist">${tabs.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}">${l}</button>`).join("")}</div>
    <div id="cabinet-panel"></div>`;
  tabsEl = $(".cabinet-tabs", root);
  panel = $("#cabinet-panel", root);
  tabsEl.addEventListener("click", (e) => { const t = e.target.closest("[data-tab]"); if (t) { location.hash = t.dataset.tab; } });
  const route = () => {
    const key = tabs.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "profile";
    $$(".tab", tabsEl).forEach((t) => { const on = t.dataset.tab === key; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", on); });
    ({ profile: showProfile, applications: showApplications, notifications: showNotifications, org: showOrg, settings: showSettings })[key]();
  };
  addEventListener("hashchange", () => {
    route();
    // при переключении раздела — к началу раздела, а не туда, где была прокрутка в прошлом
    if (tabsEl.getBoundingClientRect().top < 0 || scrollY > tabsEl.offsetTop) scrollTo({ top: Math.max(0, tabsEl.offsetTop - 80) });
  });
  route();
}

// ---------- Анкета ----------

function showProfile() {
  panel.innerHTML = `<div class="cabinet">
    <section class="card card--pad cabinet__form" id="profile-card"></section>
    <aside class="cabinet__aside">
      <div class="card card--pad">
        <div class="row" style="justify-content:space-between"><h2 class="title-sm">Мои проекты</h2><button class="btn btn--sm btn--primary" data-action="create-project">${icon("plus", "sm")}Создать</button></div>
        <div class="stack" style="--gap:.6rem;margin-top:1rem">
          ${data.mine.length ? data.mine.map((p) => `
            <a class="my-item" href="${projectUrl(p)}">
              ${imgTag(p.cover, "cover", p.title)}
              <div><div class="my-item__title">${esc(p.title)}</div><div class="row" style="--gap:.35rem">${statusBadge(p.status)}${p.closed ? '<span class="badge badge--muted">Завершён</span>' : ""}</div></div>
            </a>`).join("") : '<p class="muted">Пока нет проектов. Новый проект публикуется после проверки модератором.</p>'}
        </div>
      </div>
      <div class="card card--pad">
        <h2 class="title-sm">Как работает модерация</h2>
        <ol class="steps-list">
          <li>Вы заполняете анкету или создаёте проект.</li>
          <li>Модератор проверяет его — обычно в течение дня.</li>
          <li>После одобрения он появляется в каталоге. Если что-то не так, придёт уведомление с причиной.</li>
        </ol>
      </div>
    </aside></div>`;
  renderProfile($("#profile-card"), data.profile);
}

function renderProfile(card, profile) {
  const p = profile || {};
  const d = p.details || {};
  const org = p.kind ? p.kind === "studio" : data.account_type === "org";
  const tg = (d.contacts || []).find((c) => c.label === "Telegram")?.url || "";
  const site = (d.contacts || []).find((c) => c.label === "Сайт")?.url || "";
  card.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <h2 class="title">${org ? "Анкета организации" : "Анкета специалиста"}</h2>
      ${profile ? `<div class="row" style="--gap:.6rem">${statusBadge(p.status)}<a class="btn btn--sm ${p.status === "approved" ? "btn--outline" : "btn--ghost"}" href="${personUrl(p.slug)}">${p.status === "approved" ? "Открыть" : "Предпросмотр"}</a></div>` : ""}
    </div>
    ${profile ? moderationNotice(p.status, p.moderation_note, "анкету") : '<div class="notice">Анкеты ещё нет. Заполните форму и отправьте на проверку — после неё вас найдут в каталоге.</div>'}
    ${profile && d.draft ? '<div class="notice">Мы создали черновик анкеты организации при регистрации. Дополните его и отправьте на проверку.</div>' : ""}

    <form id="profile-form" novalidate>
      <div class="segmented" role="radiogroup" aria-label="Тип анкеты">
        <label><input type="radio" name="kind" value="person" ${!org ? "checked" : ""}><span>${icon("user", "sm")}Я специалист</span></label>
        <label><input type="radio" name="kind" value="studio" ${org ? "checked" : ""}><span>${icon("building", "sm")}Организация</span></label>
      </div>

      <div class="upload--round">${imageField("avatar_data", org ? "Логотип" : "Фото профиля", profile?.avatar && !/\/people\/[\w-]+\.webp$/.test(profile.avatar) ? profile.avatar : "")}</div>
      <div class="form-grid">
        ${field("name", org ? "Название" : "Имя", `<input class="input" id="f-name" name="name" value="${esc(p.name || "")}" maxlength="80" placeholder="${org ? "Студия «Форма»" : "Анна Миронова"}">`)}
        ${field("role", org ? "Чем занимается" : "Специализация", `<input class="input" id="f-role" name="role" value="${esc(p.role === "Организация" ? "" : p.role || "")}" maxlength="80" placeholder="${org ? "Дизайн-студия" : "UX/UI-дизайнер"}">`)}
        ${field("city", "Город", `<input class="input" id="f-city" name="city" value="${esc(p.city === "Не указан" ? "" : p.city || "")}" maxlength="60" placeholder="Москва">`)}
        ${field("tags", "Ключевые теги (через запятую)", `<input class="input" id="f-tags" name="tags" value="${esc((p.tags || []).join(", "))}" placeholder="Figma, Веб-дизайн">`)}
      </div>

      <div class="field"><span class="field__label">Направления</span>
        ${pickerHtml("directions", data.directions, p.directions || [], { max: 6, placeholder: "Найти направление или добавить своё" })}
        <div class="field__hint">До 6 направлений. Нет нужного — впишите и нажмите «Добавить».</div>
        <div class="field__error" data-error="directions"></div>
      </div>
      <div class="field"><span class="field__label">Формат работы</span>
        <div class="chips">${FORMATS.map((x) => `<label class="chip-check"><input type="checkbox" name="formats" value="${x}" ${(p.formats || []).includes(x) ? "checked" : ""}><span>${x}</span></label>`).join("")}</div>
      </div>

      ${field("bio", org ? "Об организации" : "О себе", `<textarea class="input" id="f-bio" name="bio" maxlength="1200" placeholder="${org ? "Что делаете, для кого, чем гордитесь" : "Чем занимаетесь, с кем работали, что умеете лучше всего"}">${esc(d.bio || "")}</textarea>`, "Минимум 20 символов. Первое предложение станет подзаголовком карточки.")}
      ${field("skills", org ? "Услуги и компетенции (через запятую)" : "Навыки (через запятую)", `<input class="input" id="f-skills" name="skills" value="${esc((d.skills || []).join(", "))}" placeholder="Figma, Прототипирование, Дизайн-системы">`)}

      <div class="form-grid">
        ${field("telegram", "Telegram", `<input class="input" id="f-telegram" name="telegram" value="${esc(tg)}" placeholder="@username">`)}
        ${field("website", "Сайт или портфолио", `<input class="input" id="f-website" name="website" value="${esc(site)}" placeholder="https://…">`)}
      </div>

      <div class="field"><span class="field__label">Портфолио</span>
        <div class="field__hint" style="margin:0 0 .75rem">Добавляйте изображения, видео (ссылка на YouTube, VK Видео, Rutube или Vimeo) или целые проекты.</div>
        <div class="work-rows" id="portfolio-rows">${(d.portfolio || []).map(workRow).join("")}</div>
        <div class="row" style="--gap:.5rem;margin-top:.75rem">
          <button type="button" class="btn btn--sm btn--outline" data-add-work="image">${icon("image", "sm")}Изображение</button>
          <button type="button" class="btn btn--sm btn--outline" data-add-work="video">${icon("video", "sm")}Видео</button>
          <button type="button" class="btn btn--sm btn--outline" data-add-work="project">${icon("folder", "sm")}Проект</button>
        </div>
      </div>
      ${org ? "" : `<div class="field"><span class="field__label">Опыт</span>
        <div class="rows" id="experience-rows">${(d.experience || []).map(expRow).join("")}</div>
        <button type="button" class="btn btn--sm btn--ghost" data-add="experience">${icon("plus", "sm")}Добавить место работы</button>
      </div>`}

      <div class="field"><label class="check check--sm"><input type="checkbox" name="open" ${p.open === false ? "" : "checked"}>${org ? "Открыта к новым проектам" : "Открыт(а) к новым проектам"}</label></div>

      <div class="form-error"></div>
      <div class="row" style="margin-top:1.5rem;justify-content:flex-end">
        <button type="submit" class="btn btn--primary btn--lg">${profile ? "Сохранить и отправить на проверку" : "Отправить на проверку"}</button>
      </div>
    </form>`;

  const form = $("#profile-form", card);
  clearErrorsOnInput(form);
  initPickers(form);
  initUploads($(".upload--round", form), 800);
  initUploads(form, 1600);
  form.addEventListener("change", (e) => { if (e.target.name === "kind") { data.account_type = e.target.value === "studio" ? "org" : "person"; renderProfile(card, profile && { ...profile, kind: e.target.value }); } });
  form.addEventListener("click", (e) => {
    const addWork = e.target.closest("[data-add-work]");
    if (addWork) {
      $("#portfolio-rows", card).insertAdjacentHTML("beforeend", workRow({ type: addWork.dataset.addWork }));
      initUploads(form, 1600);
    }
    if (e.target.closest("[data-add]")) $("#experience-rows", card).insertAdjacentHTML("beforeend", expRow());
    const del = e.target.closest("[data-remove]");
    if (del) del.closest(".rows__item, .work-row").remove();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements, btn = $("button[type=submit]", form), err = $(".form-error", form);
    err.textContent = "";
    const works = $$("#portfolio-rows .work-row", form).map((r) => {
      const v = (k) => $(`[data-k="${k}"]`, r)?.value.trim() || "";
      return { type: r.dataset.type, title: v("title"), meta: v("meta"), description: v("description"),
        cover: $("input[name=work_image_remove]", r)?.value === "1" ? "" : r.dataset.cover || "",
        image_data: $("input[name=work_image]", r)?.value || "", video_url: v("video_url"), project_slug: v("project_slug"), url: v("url") };
    }).filter((w) => w.title || w.image_data || w.video_url || w.project_slug || w.url);
    const body = {
      kind: $("[name=kind]:checked", form).value,
      name: f.name.value, role: f.role.value, city: f.city.value,
      tags: list(f.tags.value), skills: list(f.skills.value), bio: f.bio.value,
      directions: pickedValues(form, "directions"),
      formats: $$("[name=formats]:checked", form).map((x) => x.value),
      telegram: f.telegram.value.trim(), website: f.website.value.trim(), open: f.open.checked,
      avatar_data: f.avatar_data.value,
      portfolio: works,
      experience: $$("#experience-rows .rows__item", form).map((r) => Object.fromEntries(["place", "role", "period"].map((k) => [k, $(`[data-k="${k}"]`, r).value.trim()]))).filter((x) => x.place),
    };
    if (works.some((w) => w.title.length < 2)) { err.textContent = "У каждой работы портфолио должно быть название (минимум 2 символа)"; return; }
    btn.disabled = true;
    try {
      if (!(await requireAuth())) return;
      const { profile: saved } = await api("/api/me/profile", { method: "PUT", body });
      data.profile = saved;
      toast(saved.status === "approved" ? "Анкета сохранена и опубликована" : "Анкета отправлена на модерацию", "ok");
      renderProfile(card, saved);
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (ex) {
      showFieldErrors(form, ex.errors);
      if (ex.errors?.directions) $("[data-error=directions]", form).textContent = ex.errors.directions === "Обязательное поле" || /значений/.test(ex.errors.directions) ? "Выберите от 1 до 6 направлений" : ex.errors.directions;
      if (!Object.keys(ex.errors || {}).length || ex.errors.title || ex.errors.place || ex.errors.video_url || ex.errors.url) err.textContent = ex.errors?.title || ex.errors?.place ? "Проверьте строки портфолио и опыта: название — минимум 2 символа" : ex.errors?.video_url || ex.errors?.url || ex.message;
    } finally { btn.disabled = false; }
  });
}

const field = (name, label, control, hint = "") =>
  `<div class="field"><label class="field__label" for="f-${name}">${label}</label>${control}${hint ? `<div class="field__hint">${hint}</div>` : ""}<div class="field__error" data-error="${name}"></div></div>`;

const WORK_LABELS = { image: ["image", "Изображение"], video: ["video", "Видео"], project: ["folder", "Проект"] };

function workRow(w = {}) {
  const type = w.type || "image";
  const [ico, label] = WORK_LABELS[type];
  const input = (k, ph, max = 80, value = w[k]) => `<input class="input" data-k="${k}" value="${esc(value || "")}" placeholder="${ph}" maxlength="${max}" aria-label="${ph}">`;
  return `
  <div class="work-row" data-type="${type}" data-cover="${esc(w.cover || "")}">
    <div class="work-row__head"><span class="badge badge--purple">${icon(ico, "sm")}${label}</span><span style="flex:1"></span>
      <button type="button" class="icon-btn" data-remove aria-label="Удалить работу">${icon("x", "sm")}</button></div>
    <div class="form-grid">${input("title", "Название работы")}${input("meta", "Тип · год")}</div>
    ${type === "video" ? input("video_url", "Ссылка на видео: https://…", 300) : ""}
    ${type === "project" ? `<div class="form-grid">
      <select class="select" data-k="project_slug" aria-label="Свой проект"><option value="">— Свой проект на платформе —</option>
        ${data.my_projects.map((p) => `<option value="${esc(p.slug)}" ${w.project_slug === p.slug ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>
      ${input("url", "или ссылка на проект: https://…", 300)}</div>` : ""}
    <textarea class="input" data-k="description" maxlength="600" placeholder="Описание (необязательно)" style="height:4.5rem">${esc(w.description || "")}</textarea>
    ${imageField("work_image", type === "image" ? "Изображение" : "Обложка (необязательно)", w.cover || "")}
  </div>`;
}

const expRow = (x = {}) => `
  <div class="rows__item rows__item--3">
    <input class="input" data-k="place" value="${esc(x.place || "")}" placeholder="Компания или проект" maxlength="80" aria-label="Компания">
    <input class="input" data-k="role" value="${esc(x.role || "")}" placeholder="Роль" maxlength="80" aria-label="Роль">
    <input class="input" data-k="period" value="${esc(x.period || "")}" placeholder="2023 — 2026" maxlength="40" aria-label="Период">
    <button type="button" class="icon-btn" data-remove aria-label="Удалить">${icon("x", "sm")}</button>
  </div>`;

// ---------- Отклики ----------

async function showApplications() {
  panel.innerHTML = '<div class="skeleton" style="min-height:10rem"></div>';
  const { items } = await get("/api/me/applications");
  panel.innerHTML = `<div class="card card--pad" style="max-width:56rem">
    <h2 class="title-sm">Мои отклики</h2>
    <p class="muted" style="margin:.35rem 0 1rem">Куда вы откликнулись, что ответил автор и где продолжить переписку.</p>
    <div class="stack" style="--gap:.75rem">${items.length ? items.map((a) => `
      <article class="card app-card">
        ${imgTag(a.project.cover, "cover", a.project.title)}
        <div>
          <div class="app-card__top"><a class="u-hover" href="${projectUrl(a.project)}"><strong>${esc(a.project.title)}</strong></a>${applicationBadge(a.status)}
            ${a.replied ? '<span class="badge badge--green">Есть ответ</span>' : ""}</div>
          <p>${a.role ? `Роль «${esc(a.role)}» · ` : ""}${esc(a.project.owner_name)} · ${esc(timeAgo(a.created_at))}</p>
          <div class="row">${a.conversation_id ? `<a class="btn btn--sm btn--outline" href="/messages?c=${a.conversation_id}">${icon("chat", "sm")}Переписка</a>` : ""}
            <a class="btn btn--sm btn--ghost" href="${projectUrl(a.project)}">Проект</a></div>
        </div>
      </article>`).join("") : `<div class="empty-state"><strong>Откликов пока нет</strong>Найдите проект с открытыми ролями — <a class="link" href="/projects?has_roles=true">смотреть проекты</a>.</div>`}</div>
  </div>`;
}

// ---------- Уведомления ----------

async function showNotifications() {
  panel.innerHTML = '<div class="skeleton" style="min-height:10rem"></div>';
  const r = await get("/api/notifications?limit=100");
  panel.innerHTML = `<div class="card card--pad notif-page" style="max-width:48rem">
    <div class="row" style="justify-content:space-between"><h2 class="title-sm">Уведомления</h2>${r.unread ? '<button class="btn btn--sm btn--ghost" data-read-all>Прочитать все</button>' : ""}</div>
    <div class="stack" style="--gap:.25rem;margin-top:.75rem">${r.items.map(notifItem).join("") || '<div class="notif-panel__empty">Уведомлений пока нет.</div>'}</div>
  </div>`;
  if (r.unread) {
    await post("/api/notifications/read", {});
    dispatchEvent(new CustomEvent("sreda:counts"));
  }
  $("[data-read-all]", panel)?.addEventListener("click", (e) => { $$(".notif.is-unread", panel).forEach((n) => n.classList.remove("is-unread")); e.target.remove(); });
}

// ---------- Настройки ----------

async function showSettings() {
  panel.innerHTML = '<div class="skeleton" style="min-height:10rem"></div>';
  const st = await get("/api/me/settings");
  const radio = (name, value, label, hint, current) => `<label class="check check--sm"><input type="radio" name="${name}" value="${value}" ${current === value ? "checked" : ""}><span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ""}</span></label>`;
  panel.innerHTML = `<form class="card card--pad" style="max-width:48rem" id="settings-form" novalidate>
    <h2 class="title-sm">Настройки</h2>
    <section class="settings-block"><h3>Тема оформления</h3>${prefSwitch("theme")}</section>
    <section class="settings-block"><h3>Анимации</h3>${prefSwitch("motion")}
      <small class="muted">«Спокойные» — только мягкое проявление блоков, «Выключены» — всё сразу, без движения. Настройка сохраняется в этом браузере.</small></section>
    <section class="settings-block"><h3>Статус «в сети»</h3>
      <div class="radio-list">
        ${radio("show_online", "all", "Видят все", "Зелёная точка и «был(а) недавно» в профиле и сообщениях", st.show_online)}
        ${radio("show_online", "contacts", "Только те, с кем есть переписка", "", st.show_online)}
        ${radio("show_online", "nobody", "Никто", "Статус никому не показывается", st.show_online)}
      </div></section>
    ${st.has_profile ? `
    <section class="settings-block"><h3>Блог</h3>
      <div class="radio-list">
        ${radio("blog_visibility", "all", "Блог видят все", "", st.blog_visibility)}
        ${radio("blog_visibility", "members", st.account_type === "org" ? "Только сотрудники" : "Только я", "", st.blog_visibility)}
      </div></section>
    <section class="settings-block"><h3>Проекты в профиле</h3>
      <small class="muted">Снимите отметку, чтобы проект не показывался в вашем профиле. В самом проекте вы останетесь.</small>
      <div class="radio-list">${st.projects.length ? st.projects.map((p) => `<label class="check check--sm"><input type="checkbox" name="shown" value="${esc(p.slug)}" ${st.hidden_projects.includes(p.slug) ? "" : "checked"}>
        <span>${esc(p.title)} <small class="muted">· ${p.founder ? "основатель" : "участник"}${p.closed ? " · завершён" : ""}</small></span></label>`).join("") : '<p class="muted">Вы пока не участвуете в проектах.</p>'}</div>
    </section>` : '<section class="settings-block"><p class="muted">Заполните анкету, чтобы настроить блог и видимость проектов в профиле.</p></section>'}
    <div class="form-error"></div>
    <div class="row" style="justify-content:flex-end;margin-top:1rem"><button class="btn btn--primary" type="submit">Сохранить</button></div>
  </form>`;
  const form = $("#settings-form", panel);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try {
      await api("/api/me/settings", { method: "PUT", body: {
        show_online: $("[name=show_online]:checked", form).value,
        blog_visibility: $("[name=blog_visibility]:checked", form)?.value || "all",
        hidden_projects: $$("[name=shown]", form).filter((c) => !c.checked).map((c) => c.value),
      } });
      toast("Настройки сохранены", "ok");
    } catch (ex) { $(".form-error", form).textContent = ex.message; }
    finally { btn.disabled = false; }
  });
}

// ---------- Сотрудники организации ----------

const staffRow = (m) => `
  <div class="member-row" data-member="${esc(m.slug)}">
    ${imgTag(m.avatar, "avatar", m.name)}
    <div class="member-row__main">
      <strong>${esc(m.name)}</strong>
      <input class="input" data-role value="${esc(m.role || "")}" placeholder="Должность" maxlength="60" aria-label="Должность ${esc(m.name)}">
      <div class="member-row__flags">
        <label class="check check--sm"><input type="checkbox" data-can-post ${m.can_post ? "checked" : ""}>Публикует в блоге организации</label>
        <label class="check check--sm"><input type="checkbox" data-visible ${m.visible !== false ? "checked" : ""}>Виден посетителям</label>
      </div>
    </div>
    <button type="button" class="icon-btn" data-remove aria-label="Убрать">${icon("x", "sm")}</button>
  </div>`;

async function showOrg() {
  panel.innerHTML = '<div class="skeleton" style="min-height:10rem"></div>';
  let o;
  try { o = await get("/api/me/org"); }
  catch (err) { panel.innerHTML = `<div class="empty-state"><strong>Сначала анкета</strong>${esc(err.message)}. <a class="link" href="#profile">Заполнить</a></div>`; return; }
  const radio = (value, label) => `<label class="check check--sm"><input type="radio" name="staff_visibility" value="${value}" ${o.staff_visibility === value ? "checked" : ""}>${label}</label>`;
  panel.innerHTML = `<form class="card card--pad" style="max-width:52rem" id="org-form" novalidate>
    <h2 class="title-sm">Сотрудники «${esc(o.name)}»</h2>
    <p class="muted" style="margin:.35rem 0 1rem">Добавьте специалистов из каталога. Кто участвует в каком проекте и кто там публикует — настраивается в самом проекте («Команда и права»).</p>
    <div data-members>${o.staff.map(staffRow).join("") || '<p class="muted" data-empty>Сотрудников пока нет.</p>'}</div>
    <div class="member-search"><input class="input" placeholder="Добавить сотрудника: имя или навык" aria-label="Найти специалиста"><div class="member-search__results" hidden></div></div>
    <section class="settings-block" style="margin-top:1rem"><h3>Кого видят посетители</h3>
      <div class="radio-list">${radio("all", "Всех сотрудников")}${radio("selected", "Только отмеченных «Виден посетителям»")}${radio("hidden", "Никого — состав скрыт")}</div>
      <label class="check check--sm"><input type="checkbox" name="show_staff_count" ${o.show_staff_count ? "checked" : ""}>Показывать количество сотрудников, даже если состав скрыт</label>
    </section>
    <div class="form-error"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn--primary" type="submit">Сохранить</button></div>
  </form>`;
  const form = $("#org-form", panel), listEl = $("[data-members]", form);
  listEl.addEventListener("click", (e) => e.target.closest("[data-remove]")?.closest(".member-row").remove());
  memberSearch($(".member-search", form), (s) => {
    if ($(`[data-member="${CSS.escape(s.slug)}"]`, listEl)) return;
    $("[data-empty]", listEl)?.remove();
    listEl.insertAdjacentHTML("beforeend", staffRow({ ...s, visible: true }));
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/me/org", { method: "PUT", body: {
        staff: $$(".member-row", listEl).map((r) => ({ slug: r.dataset.member, role: $("[data-role]", r).value,
          can_post: $("[data-can-post]", r).checked, visible: $("[data-visible]", r).checked })),
        staff_visibility: $("[name=staff_visibility]:checked", form).value, show_staff_count: form.elements.show_staff_count.checked,
      } });
      toast("Сотрудники сохранены", "ok");
    } catch (ex) { $(".form-error", form).textContent = ex.message; }
  });
  observeReveal(panel);
}
