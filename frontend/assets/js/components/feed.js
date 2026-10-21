/** Лента записей: блог пользователя или организации, лента проекта (результаты работы, новости, опросы).
 *  mountFeed(box, "project" | "profile", slug) — загрузка, публикация, голосование, удаление, жалоба. */
import { api, get, post } from "../core/api.js";
import { $, $$, esc, timeAgo } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { currentUser, requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { initUploads, imageField } from "./actions.js";
import { personUrl } from "./cards.js";
import { confirmDialog, openLightbox } from "./modal.js";

const KINDS = { post: "Запись", result: "Результат работы", poll: "Опрос" };

function pollHtml(p) {
  const voted = p.poll.my_vote != null, total = p.poll.total || 0;
  return `<div class="poll" data-poll="${p.id}">${p.poll.options.map((o, i) => {
    const share = total ? Math.round((o.votes / total) * 100) : 0;
    return `<button type="button" class="poll__opt ${p.poll.my_vote === i ? "is-mine" : ""}" data-vote="${i}" style="--share:${voted ? share : 0}%">
      <span>${esc(o.text)}</span>${voted ? `<b>${share}%</b>` : ""}</button>`;
  }).join("")}<small class="muted">${total ? `${total} ${total % 10 === 1 && total % 100 !== 11 ? "голос" : "голосов"}` : "Пока нет голосов"}${voted ? " · можно переголосовать" : ""}</small></div>`;
}

function postHtml(p, ownerType) {
  const author = p.author.slug ? `<a href="${personUrl(p.author.slug)}">${esc(p.author.name)}</a>` : esc(p.author.name);
  return `<article class="card post" data-post="${p.id}">
    <header class="post__head">
      ${imgTag(p.author.avatar, "avatar", p.author.name)}
      <div><strong>${author}</strong><small>${esc(timeAgo(p.created_at))}${p.kind !== "post" ? ` · <span class="post__kind post__kind--${p.kind}">${KINDS[p.kind]}</span>` : ""}</small></div>
      <div class="post__menu">
        ${p.can_delete ? `<button class="icon-btn" type="button" data-del="${p.id}" aria-label="Удалить запись" title="Удалить">${icon("trash", "sm")}</button>`
          : currentUser() ? `<button class="icon-btn" type="button" data-action="report" data-type="post" data-slug="${p.id}" data-title="${esc(p.title || p.body.slice(0, 40))}" aria-label="Пожаловаться" title="Пожаловаться">${icon("flag", "sm")}</button>` : ""}
      </div>
    </header>
    ${p.title ? `<h3 class="post__title">${esc(p.title)}</h3>` : ""}
    ${p.body ? `<p class="post__body">${esc(p.body).replace(/\n/g, "<br>")}</p>` : ""}
    ${p.image ? `<button type="button" class="post__image" data-zoom>${imgTag(p.image, "cover", p.title || "Изображение")}</button>` : ""}
    ${p.poll ? pollHtml(p) : ""}
  </article>`;
}

function composerHtml(ownerType) {
  return `<form class="card card--pad composer" data-feed-form novalidate>
    <div class="seg composer__kinds" role="group" aria-label="Тип записи">
      <button type="button" data-kind="post" aria-pressed="true">${icon("feed", "sm")}Запись</button>
      ${ownerType === "project" ? `<button type="button" data-kind="result" aria-pressed="false">${icon("check", "sm")}Результат</button>` : ""}
      <button type="button" data-kind="poll" aria-pressed="false">${icon("poll", "sm")}Опрос</button>
    </div>
    <input class="input" name="title" maxlength="120" placeholder="Заголовок (необязательно)">
    <textarea class="input" name="body" maxlength="4000" placeholder="Что нового?"></textarea>
    <div class="composer__poll" hidden>
      <div class="stack" style="--gap:.5rem" data-options>
        <input class="input" data-option maxlength="80" placeholder="Вариант 1"><input class="input" data-option maxlength="80" placeholder="Вариант 2">
      </div>
      <button type="button" class="btn btn--sm btn--ghost" data-add-option>${icon("plus", "sm")}Ещё вариант</button>
    </div>
    <div class="composer__image">${imageField("image_data", "Картинка", "", "Необязательно. Сожмётся перед отправкой.")}</div>
    <div class="form-error"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn--primary" type="submit">${icon("send", "sm")}Опубликовать</button></div>
  </form>`;
}

export async function mountFeed(box, ownerType, slug, { emptyText = "Записей пока нет." } = {}) {
  let kind = "post";
  const load = async () => {
    let r;
    try { r = await get(`/api/posts?owner_type=${ownerType}&owner_slug=${encodeURIComponent(slug)}`); }
    catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
    box.innerHTML = `
      ${r.can_post ? composerHtml(ownerType) : ""}
      ${r.hidden ? `<div class="empty-state"><strong>${icon("lock", "sm")} Лента закрыта</strong>Её читают только участники.</div>`
        : r.items.length ? `<div class="feed">${r.items.map((p) => postHtml(p, ownerType)).join("")}</div>`
        : `<div class="empty-state">${esc(emptyText)}</div>`}`;
    initUploads(box);
    kind = "post";
  };
  box.addEventListener("click", async (e) => {
    const k = e.target.closest("[data-kind]");
    if (k) {
      kind = k.dataset.kind;
      $$("[data-kind]", box).forEach((b) => b.setAttribute("aria-pressed", String(b === k)));
      const form = $("[data-feed-form]", box);
      $(".composer__poll", form).hidden = kind !== "poll";
      $(".composer__image", form).hidden = kind === "poll";
      form.elements.title.placeholder = kind === "poll" ? "Вопрос опроса" : "Заголовок (необязательно)";
      form.elements.body.placeholder = kind === "poll" ? "Пояснение (необязательно)" : kind === "result" ? "Что сделали и что получилось?" : "Что нового?";
      return;
    }
    if (e.target.closest("[data-add-option]")) {
      const list = $("[data-options]", box), n = list.children.length;
      if (n < 8) list.insertAdjacentHTML("beforeend", `<input class="input" data-option maxlength="80" placeholder="Вариант ${n + 1}">`);
      return;
    }
    const vote = e.target.closest("[data-vote]");
    if (vote) {
      if (!(await requireAuth())) return;
      const id = vote.closest("[data-poll]").dataset.poll;
      try {
        const p = await post(`/api/posts/${id}/vote`, { option: +vote.dataset.vote });
        vote.closest("[data-poll]").outerHTML = pollHtml(p);
      } catch (err) { toast(err.message, "err"); }
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      if (!(await confirmDialog("Удалить запись?", "Её больше никто не увидит.", { ok: "Удалить", danger: true }))) return;
      try { await api(`/api/posts/${del.dataset.del}`, { method: "DELETE" }); del.closest(".post").remove(); toast("Запись удалена"); }
      catch (err) { toast(err.message, "err"); }
      return;
    }
    const zoom = e.target.closest("[data-zoom]");
    if (zoom) openLightbox($("img", zoom).src, zoom.closest(".post").querySelector(".post__title")?.textContent || "");
  });
  box.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-feed-form]")) return;
    e.preventDefault();
    const f = e.target, btn = $("button[type=submit]", f), err = $(".form-error", f);
    err.textContent = "";
    btn.disabled = true;
    try {
      await post("/api/posts", {
        owner_type: ownerType, owner_slug: slug, kind, title: f.elements.title.value, body: f.elements.body.value,
        image_data: kind === "poll" ? "" : f.elements.image_data.value,
        options: kind === "poll" ? $$("[data-option]", f).map((i) => i.value).filter((v) => v.trim()) : [],
      });
      toast("Опубликовано", "ok");
      await load();
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
  await load();
}
