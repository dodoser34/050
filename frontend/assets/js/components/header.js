/** Шапка сайта: навигация, вход / меню пользователя, уведомления и сообщения, мобильное меню,
 *  переключатель темы, скрытие при прокрутке вниз. */
import { $, $$, esc, initials, lockScroll, timeAgo } from "../core/dom.js";
import { icon, LOGO_MARK } from "../core/icons.js";
import { currentUser, logout, sessionReady } from "../core/session.js";
import { get, post } from "../core/api.js";
import { bindPrefSwitches, prefSwitch, setPref } from "../core/prefs.js";

const NAV = [
  { href: "/services", label: "Специалисты", key: "services", icon: "users" },
  { href: "/projects", label: "Проекты", key: "projects", icon: "folder" },
  { href: "/about", label: "О нас", key: "about", icon: "info" },
];
const NOTIF_ICONS = { message: "chat", application: "send", application_status: "check", invite: "user-plus",
  moderation: "shield", report: "flag", member: "users", post: "feed" };

let counts = { unread_messages: 0, unread_notifications: 0 };

export function renderHeader() {
  const host = $("[data-header]");
  if (!host) return;
  const active = host.dataset.active || "";
  const minimal = host.hasAttribute("data-minimal");
  host.className = "header";
  host.innerHTML = `
    <div class="container header__inner">
      <a class="logo" href="/" aria-label="Среда — на главную">${LOGO_MARK}Среда</a>
      ${minimal ? "" : `<nav class="nav" aria-label="Основная навигация">
        ${NAV.map((n) => `<a class="nav__link ${n.key === active ? "is-active" : ""}" href="${n.href}" ${n.key === active ? 'aria-current="page"' : ""}>${n.label}</a>`).join("")}
      </nav>`}
      <div class="header__actions">
        <button class="head-btn header__theme" type="button" data-theme-toggle aria-label="Сменить тему" title="Сменить тему">${icon(themeIcon())}</button>
        ${minimal ? `<a class="btn btn--ghost" href="/">На главную ${icon("arrow-up-right", "sm")}</a>` : `
        <span data-user-slot hidden></span>
        <a class="btn btn--outline header__login" href="/login" data-auth-slot>Войти</a>
        <button class="btn btn--primary header__create" data-action="create-project" aria-label="Создать проект">${icon("plus")}<span class="header__create-text">Создать проект</span></button>
        <button class="menu-btn" type="button" aria-label="Меню" aria-expanded="false">${icon("menu")}</button>`}
      </div>
    </div>`;

  bindPrefSwitches(document);
  $("[data-theme-toggle]", host).addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    setPref("theme", dark ? "light" : "dark");
  });
  addEventListener("sreda:prefs", () => { $("[data-theme-toggle]", host).innerHTML = icon(themeIcon()); });

  if (!minimal) {
    initMobileMenu(host, active);
    sessionReady.then(() => renderUser(host));
  }
  initScrollBehaviour(host);
}

const themeIcon = () => (document.documentElement.dataset.theme === "dark" ? "sun" : "moon");

function renderUser(host) {
  const user = currentUser();
  const slot = $("[data-auth-slot]", host);
  if (!user || !slot) return;

  // уведомления и сообщения — рядом с кнопкой создания проекта
  const userSlot = $("[data-user-slot]", host);
  userSlot.outerHTML = `
    <a class="head-btn" href="/messages" aria-label="Сообщения" title="Сообщения">${icon("chat")}<span class="count-badge" data-count-badge="unread_messages"></span></a>
    <div class="notif-menu">
      <button class="head-btn" type="button" data-notif-btn aria-haspopup="true" aria-expanded="false" aria-label="Уведомления" title="Уведомления">${icon("bell")}<span class="count-badge" data-count-badge="unread_notifications"></span></button>
      <div class="dropdown notif-panel" data-notif-panel hidden></div>
    </div>`;

  const menu = document.createElement("div");
  menu.className = "user-menu";
  menu.innerHTML = `
    <button class="user-menu__btn ${user.is_admin ? "is-admin" : ""}" type="button" aria-haspopup="true" aria-expanded="false" title="${esc(user.name)}">${esc(initials(user.name))}</button>
    <div class="dropdown" hidden>
      <div class="dropdown__head"><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small>${user.is_admin ? '<span class="badge badge--purple" style="margin-top:.4rem">Администратор</span>' : ""}</div>
      ${user.is_admin ? `<a class="dropdown__item dropdown__item--accent" href="/admin">${icon("shield")}Админ-панель</a>` : ""}
      <a class="dropdown__item" href="/me">${icon("user")}Личный кабинет</a>
      <a class="dropdown__item" href="/messages">${icon("chat")}Сообщения</a>
      <a class="dropdown__item" href="/me#applications">${icon("send")}Мои отклики</a>
      <a class="dropdown__item" href="/projects?mine=true">${icon("folder")}Мои проекты</a>
      <a class="dropdown__item" href="/me#settings">${icon("settings")}Настройки</a>
      <div class="dropdown__sep"></div>
      <button class="dropdown__item" type="button" data-logout>${icon("logout")}Выйти</button>
    </div>`;
  slot.replaceWith(menu);
  const btn = $(".user-menu__btn", menu), dd = $(".dropdown", menu);
  const nbtn = $("[data-notif-btn]", host), panel = $("[data-notif-panel]", host);
  const closeAll = () => {
    dd.hidden = true; panel.hidden = true;
    btn.setAttribute("aria-expanded", "false"); nbtn.setAttribute("aria-expanded", "false");
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = dd.hidden;
    closeAll();
    dd.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  });
  nbtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panel.hidden;
    closeAll();
    if (open) { panel.hidden = false; nbtn.setAttribute("aria-expanded", "true"); loadNotifications(panel); }
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeAll());
  $("[data-logout]", menu).addEventListener("click", logout);
  get("/api/auth/demo").then((demo) => {
    if (!demo.enabled) return;
    const entry = document.createElement("a");
    entry.className = "dropdown__item";
    entry.href = "/login?demo=1";
    entry.innerHTML = `${icon("users")}Демо: сменить роль`;
    $("[data-logout]", menu).before(entry);
  }).catch(() => {});

  refreshCounts();
  setInterval(() => !document.hidden && refreshCounts(), 20000);
  document.addEventListener("visibilitychange", () => !document.hidden && refreshCounts());
  addEventListener("sreda:counts", refreshCounts);
}

/** Счётчики непрочитанного в шапке и в мобильном меню. */
async function refreshCounts() {
  try { counts = await get("/api/me/summary"); }
  catch { return; }
  $$("[data-count-badge]").forEach((b) => {
    const n = counts[b.dataset.countBadge] || 0;
    b.dataset.n = n;
    b.textContent = n > 99 ? "99+" : n || "";
  });
}

async function loadNotifications(panel) {
  panel.innerHTML = '<div class="notif-panel__empty">Загрузка…</div>';
  try {
    const r = await get("/api/notifications?limit=15");
    panel.innerHTML = `
      <div class="notif-panel__head"><strong>Уведомления</strong>${r.unread ? '<button type="button" data-read-all>Прочитать все</button>' : ""}</div>
      ${r.items.length ? r.items.map(notifItem).join("") : '<div class="notif-panel__empty">Пока тихо. Здесь появятся ответы на отклики, сообщения и новости проектов.</div>'}
      <a class="notif-panel__all" href="/me#notifications">Все уведомления</a>`;
    $("[data-read-all]", panel)?.addEventListener("click", async () => {
      await post("/api/notifications/read", {});
      $$(".notif.is-unread", panel).forEach((n) => n.classList.remove("is-unread"));
      $("[data-read-all]", panel)?.remove();
      refreshCounts();
    });
    if (r.unread) post("/api/notifications/read", { ids: r.items.filter((n) => !n.read).map((n) => n.id) }).then(refreshCounts).catch(() => {});
  } catch (err) {
    panel.innerHTML = `<div class="notif-panel__empty">${esc(err.message)}</div>`;
  }
}

export const notifItem = (n) => `
  <a class="notif ${n.read ? "" : "is-unread"}" href="${esc(n.url || "#")}">
    <span class="notif__icon">${icon(NOTIF_ICONS[n.kind] || "bell")}</span>
    <span>${esc(n.text)}<small>${esc(timeAgo(n.created_at))}</small></span>
  </a>`;

function initMobileMenu(host, active) {
  const btn = $(".menu-btn", host);
  let panel = null;
  const close = () => {
    if (!panel) return;
    panel.remove(); panel = null;
    btn.innerHTML = icon("menu");
    btn.setAttribute("aria-expanded", "false");
    host.classList.remove("is-menu-open");
    lockScroll(false);
  };
  const link = (href, label, ico, cls = "", extra = "") => `<a class="mobile-nav__link ${cls}" href="${href}">${icon(ico)}<span>${label}</span>${extra}</a>`;
  btn.addEventListener("click", () => {
    if (panel) return close();
    const user = currentUser();
    panel = document.createElement("nav");
    panel.className = "mobile-nav";
    panel.setAttribute("aria-label", "Меню");
    panel.innerHTML = `
      ${link("/", "Главная", "home", active === "home" ? "is-active" : "")}
      ${NAV.map((n) => link(n.href, n.label, n.icon, n.key === active ? "is-active" : "")).join("")}
      <div class="mobile-nav__group">
        ${user ? `
          ${user.is_admin ? link("/admin", "Админ-панель", "shield") : ""}
          ${link("/messages", "Сообщения", "chat", "", `<span class="count-badge" data-count-badge="unread_messages" data-n="${counts.unread_messages}">${counts.unread_messages || ""}</span>`)}
          ${link("/me#notifications", "Уведомления", "bell", "", `<span class="count-badge" data-count-badge="unread_notifications" data-n="${counts.unread_notifications}">${counts.unread_notifications || ""}</span>`)}
          ${link("/me", "Личный кабинет", "user")}
          ${link("/me#applications", "Мои отклики", "send")}
          ${link("/projects?mine=true", "Мои проекты", "folder")}
          ${link("/me#settings", "Настройки", "settings")}
          <button class="mobile-nav__link" type="button" data-logout style="background:none;border:0;width:100%">${icon("logout")}<span>Выйти</span></button>`
        : `${link("/login", "Войти", "user")}${link("/register", "Регистрация", "user-plus")}`}
      </div>
      <div class="mobile-nav__group">
        <p class="mobile-nav__label">Тема</p>${prefSwitch("theme")}
        <p class="mobile-nav__label">Анимации</p>${prefSwitch("motion")}
      </div>
      <button class="btn btn--primary btn--lg" data-action="create-project">${icon("plus")}Создать проект</button>`;
    document.body.append(panel);
    lockScroll(true);
    host.classList.remove("is-hidden");
    host.classList.add("is-menu-open");
    btn.innerHTML = icon("x");
    btn.setAttribute("aria-expanded", "true");
    $("[data-logout]", panel)?.addEventListener("click", logout);
    panel.addEventListener("click", (e) => { if (e.target.closest("a, [data-action]")) close(); });
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
  addEventListener("resize", () => { if (innerWidth > 960) close(); });
  addEventListener("pageshow", close);
}

/** Тень после прокрутки; прячется при скролле вниз, появляется при скролле вверх. Пока открыто меню — всегда на месте. */
function initScrollBehaviour(host) {
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    const locked = document.documentElement.classList.contains("is-locked");
    host.classList.toggle("is-scrolled", y > 8);
    if (!locked) host.classList.toggle("is-hidden", y > 480 && y > lastY + 2);
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

