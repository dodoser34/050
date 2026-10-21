/** Сообщения: список диалогов и переписка. На телефоне — по очереди: список → диалог.
 *  Новые сообщения подтягиваются опросом сервера. ?c=ID — открыть диалог, ?to=slug — написать владельцу анкеты. */
import { get, post } from "../core/api.js";
import { $, esc, timeAgo } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { imgTag } from "../core/placeholders.js";
import { requireAuth } from "../core/session.js";
import { toast } from "../core/toast.js";
import { applicationBadge, nameMarks, personUrl, presenceLabel, projectUrl } from "../components/cards.js";
import { confirmDialog } from "../components/modal.js";

let state = { list: [], active: null, lastId: 0, draftTo: null };
let root;

export async function init() {
  root = $("#chat");
  if (!(await requireAuth())) return;
  root.innerHTML = `
    <aside class="chat__list" aria-label="Диалоги">
      <div class="chat__list-head"><h1 class="title-sm">Сообщения</h1></div>
      <div class="chat__items" data-items><div class="chat__empty">Загрузка…</div></div>
    </aside>
    <section class="chat__thread" data-thread aria-live="polite">
      <div class="chat__placeholder">${icon("chat", "lg")}<p>Выберите диалог слева или напишите специалисту из каталога.</p><a class="btn btn--outline" href="/services">Найти специалиста</a></div>
    </section>`;
  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  root.addEventListener("keydown", (e) => {
    if (e.target.matches("[data-composer] textarea") && e.key === "Enter" && !e.shiftKey && matchMedia("(hover: hover)").matches) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });

  const params = new URLSearchParams(location.search);
  await loadList();
  if (params.get("to")) await startDraft(params.get("to"));
  else if (params.get("c")) await openConversation(+params.get("c"));
  else if (matchMedia("(min-width: 861px)").matches && state.list[0]) await openConversation(state.list[0].id, { replace: true });

  setInterval(() => { if (!document.hidden) poll(); }, 4000);
  addEventListener("popstate", () => {
    const c = +new URLSearchParams(location.search).get("c");
    if (c) openConversation(c, { push: false }); else showList();
  });
}

async function loadList() {
  const r = await get("/api/conversations");
  state.list = r.items;
  renderList();
}

function renderList() {
  const box = $("[data-items]", root);
  box.innerHTML = state.list.length ? state.list.map((c) => `
    <a class="chat-item ${state.active?.id === c.id ? "is-active" : ""} ${c.unread ? "is-unread" : ""}" href="?c=${c.id}" data-open="${c.id}">
      <span class="chat-item__ava">${imgTag(c.peer.avatar, "avatar", c.peer.name, c.peer.kind === "studio" ? 'class="is-org"' : "")}${c.peer.presence?.online ? '<span class="online-dot"></span>' : ""}</span>
      <span class="chat-item__body">
        <span class="chat-item__top"><strong>${esc(c.peer.name)}</strong>${nameMarks(c.peer)}<time>${esc(timeAgo(c.last.created_at))}</time></span>
        ${c.project ? `<span class="chat-item__project">${icon("folder", "sm")}${esc(c.project.title)}</span>` : ""}
        <span class="chat-item__last">${c.last.mine ? "Вы: " : ""}${esc(c.last.body.replace(/\s+/g, " "))}</span>
      </span>
      ${c.unread ? `<span class="count-badge chat-item__count" data-n="${c.unread}">${c.unread}</span>` : ""}
    </a>`).join("") : `<div class="chat__empty">Диалогов пока нет. Напишите специалисту или откликнитесь на проект — переписка появится здесь.</div>`;
}

/** Ссылки в тексте: внутренние пути (/projects/…) и https-адреса. Остальное экранируется. */
const linkify = (text) => esc(text).replace(/(https?:\/\/[^\s<]+|(?:\/[\w-]+)*\/(?:projects|people)\/[^\s<]+)/g,
  (m) => `<a href="${m}" ${m.startsWith("http") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${m}</a>`).replace(/\n/g, "<br>");

const bubble = (m) => `<div class="msg ${m.mine ? "is-mine" : ""}" data-id="${m.id}"><div class="msg__body">${linkify(m.body)}</div><time>${esc(timeAgo(m.created_at))}</time></div>`;

function threadHead(peer, project) {
  return `
    <header class="chat__head">
      <button class="head-btn chat__back" type="button" data-back aria-label="К списку диалогов">${icon("arrow-left")}</button>
      ${peer.slug ? `<a class="chat__peer" href="${personUrl(peer.slug)}">` : '<div class="chat__peer">'}
        ${imgTag(peer.avatar, "avatar", peer.name, peer.kind === "studio" ? 'class="is-org"' : "")}
        <span><strong>${esc(peer.name)}</strong>${nameMarks(peer)}<small>${presenceLabel(peer.presence) || esc(peer.role || "")}</small></span>
      ${peer.slug ? "</a>" : "</div>"}
      ${project ? `<a class="chat__project" href="${projectUrl(project)}">${icon("folder", "sm")}<span>${esc(project.title)}</span></a>` : ""}
    </header>`;
}

function applicationBar(a) {
  if (!a) return "";
  return `<div class="chat__app" data-app>
    <span>${a.mine ? "Ваш отклик" : "Отклик"}${a.role ? ` на роль «${esc(a.role)}»` : ""}</span>${applicationBadge(a.status)}
    ${a.can_decide && a.status === "pending" ? `<span class="chat__app-actions">
      <button class="btn btn--sm btn--primary" data-decide="accepted" data-app-id="${a.id}">${icon("check", "sm")}Принять</button>
      <button class="btn btn--sm btn--outline" data-decide="declined" data-app-id="${a.id}">Отклонить</button></span>` : ""}
  </div>`;
}

const composer = () => `
  <form class="chat__composer" data-composer>
    <textarea name="body" rows="1" maxlength="2000" placeholder="Сообщение" aria-label="Сообщение" required></textarea>
    <button class="btn btn--primary chat__send" type="submit" aria-label="Отправить">${icon("send")}</button>
  </form>`;

async function openConversation(id, { push = true, replace = false } = {}) {
  let c;
  try { c = await get(`/api/conversations/${id}`); }
  catch (err) { toast(err.message, "err"); return; }
  state.active = c;
  state.draftTo = null;
  state.lastId = c.messages.at(-1)?.id || 0;
  const url = `?c=${id}`;
  if (replace) history.replaceState(null, "", url); else if (push && location.search !== url) history.pushState(null, "", url);
  const thread = $("[data-thread]", root);
  thread.innerHTML = `${threadHead(c.peer, c.project)}${applicationBar(c.application)}
    <div class="chat__messages" data-messages>${c.messages.map(bubble).join("")}</div>${composer()}`;
  root.classList.add("is-thread");
  scrollDown();
  const item = state.list.find((x) => x.id === id);
  if (item?.unread) { item.unread = 0; dispatchEvent(new CustomEvent("sreda:counts")); }
  renderList();
  if (matchMedia("(hover: hover)").matches) $("[data-composer] textarea", thread)?.focus();
}

async function startDraft(slug) {
  const existing = state.list.find((c) => c.peer.slug === slug && !c.project);
  if (existing) return openConversation(existing.id, { replace: true });
  let s;
  try { s = await get(`/api/specialists/${encodeURIComponent(slug)}`); }
  catch { toast("Профиль не найден", "err"); return; }
  if (s.is_owner) { toast("Это ваша анкета"); return; }
  state.active = null;
  state.draftTo = slug;
  $("[data-thread]", root).innerHTML = `${threadHead({ ...s, presence: s.presence }, null)}
    <div class="chat__messages" data-messages><div class="chat__hint">Начните диалог с ${esc(s.name)}. Сообщение придёт в раздел «Сообщения» получателя.</div></div>${composer()}`;
  root.classList.add("is-thread");
  $("[data-composer] textarea", root)?.focus();
}

function showList() {
  root.classList.remove("is-thread");
  state.active = null;
  renderList();
}

const scrollDown = () => { const box = $("[data-messages]", root); if (box) box.scrollTop = box.scrollHeight; };

async function poll() {
  try {
    if (state.active) {
      const r = await get(`/api/conversations/${state.active.id}?after=${state.lastId}`);
      if (r.messages.length) {
        const box = $("[data-messages]", root);
        const fresh = r.messages.filter((m) => !box.querySelector(`[data-id="${m.id}"]`));
        box.insertAdjacentHTML("beforeend", fresh.map(bubble).join(""));
        state.lastId = r.messages.at(-1).id;
        scrollDown();
      }
      if (r.application && JSON.stringify(r.application) !== JSON.stringify(state.active.application)) {
        state.active.application = r.application;
        $("[data-app]", root)?.replaceWith(document.createRange().createContextualFragment(applicationBar(r.application)));
      }
    }
    await loadList();
  } catch { /* сеть пропала — попробуем на следующем шаге */ }
}

async function onSubmit(e) {
  if (!e.target.matches("[data-composer]")) return;
  e.preventDefault();
  const form = e.target, input = form.elements.body, body = input.value.trim();
  if (!body) return;
  const btn = $("button", form);
  btn.disabled = true;
  try {
    if (state.draftTo) {
      const { id } = await post("/api/conversations", { to_slug: state.draftTo, message: body });
      input.value = "";
      await loadList();
      await openConversation(id, { replace: true });
    } else {
      const m = await post(`/api/conversations/${state.active.id}/messages`, { body });
      input.value = "";
      $("[data-messages]", root).insertAdjacentHTML("beforeend", bubble(m));
      state.lastId = Math.max(state.lastId, m.id);
      scrollDown();
      setTimeout(poll, 400); // демо-анкета отвечает сразу — подтянем ответ
    }
    input.style.height = "";
  } catch (err) { toast(err.message, "err"); }
  finally { btn.disabled = false; input.focus(); }
}

async function onClick(e) {
  const open = e.target.closest("[data-open]");
  if (open) { e.preventDefault(); openConversation(+open.dataset.open); return; }
  if (e.target.closest("[data-back]")) { history.pushState(null, "", location.pathname); showList(); return; }
  const decide = e.target.closest("[data-decide]");
  if (decide) {
    const accepted = decide.dataset.decide === "accepted";
    if (!(await confirmDialog(accepted ? "Принять отклик?" : "Отклонить отклик?",
      accepted ? "Участник попадёт в команду проекта, а роль уберётся из открытых." : "Автор отклика получит уведомление.",
      { ok: accepted ? "Принять" : "Отклонить", danger: !accepted }))) return;
    try {
      await post(`/api/applications/${decide.dataset.appId}/decision`, { status: decide.dataset.decide });
      toast(accepted ? "Отклик принят" : "Отклик отклонён", "ok");
      await openConversation(state.active.id, { push: false });
    } catch (err) { toast(err.message, "err"); }
  }
}

// поле ввода растёт вместе с текстом
document.addEventListener("input", (e) => {
  if (!e.target.matches("[data-composer] textarea")) return;
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
});

