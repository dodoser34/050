/** Шапка сайта: навигация, вход / меню пользователя, мобильное меню, скрытие при прокрутке вниз. */
import { $, esc, initials } from "../core/dom.js";
import { icon, LOGO_MARK } from "../core/icons.js";
import { currentUser, logout, sessionReady } from "../core/session.js";
import { get } from "../core/api.js";

const NAV = [
  { href: "/services", label: "Услуги", key: "services" },
  { href: "/projects", label: "Проекты", key: "projects" },
  { href: "/about", label: "О нас", key: "about" },
];

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
        ${minimal ? `<a class="btn btn--ghost" href="/">На главную ${icon("arrow-up-right", "sm")}</a>` : `
        <a class="btn btn--outline header__login" href="/login" data-auth-slot>Войти</a>
        <button class="btn btn--primary header__create" data-action="create-project" aria-label="Создать проект">${icon("plus")}<span class="header__create-text">Создать проект</span></button>
        <button class="menu-btn" aria-label="Меню" aria-expanded="false">${icon("menu")}</button>`}
      </div>
    </div>`;

  if (!minimal) {
    initMobileMenu(host, active);
    sessionReady.then(() => renderUser(host));
  }
  initScrollBehaviour(host);
}

function renderUser(host) {
  const user = currentUser();
  const slot = $("[data-auth-slot]", host);
  if (!user || !slot) return;
  const menu = document.createElement("div");
  menu.className = "user-menu";
  menu.innerHTML = `
    <button class="user-menu__btn ${user.is_admin ? "is-admin" : ""}" aria-haspopup="true" aria-expanded="false" title="${esc(user.name)}">${esc(initials(user.name))}</button>
    <div class="dropdown" hidden>
      <div class="dropdown__head"><strong>${esc(user.name)}</strong><small>${esc(user.email)}</small>${user.is_admin ? '<span class="badge badge--purple" style="margin-top:.4rem">Администратор</span>' : ""}</div>
      ${user.is_admin ? '<a class="dropdown__item dropdown__item--accent" href="/admin">Админ-панель</a>' : ""}
      <a class="dropdown__item" href="/me">Личный кабинет</a>
      <a class="dropdown__item" href="/projects?mine=true">Мои проекты</a>
      <a class="dropdown__item" href="/projects?sort=new">Новые проекты</a>
      <a class="dropdown__item" href="/services">Найти специалиста</a>
      <button class="dropdown__item" type="button" data-logout>${"Выйти"}</button>
    </div>`;
  slot.replaceWith(menu);
  const btn = $(".user-menu__btn", menu), dd = $(".dropdown", menu);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dd.hidden = !dd.hidden;
    btn.setAttribute("aria-expanded", String(!dd.hidden));
  });
  document.addEventListener("click", () => (dd.hidden = true));
  $("[data-logout]", menu).addEventListener("click", logout);
  get("/api/auth/demo").then((demo) => {
    if (!demo.enabled) return;
    const entry = document.createElement("a");
    entry.className = "dropdown__item";
    entry.href = "/login?demo=1";
    entry.textContent = "Демо: сменить роль";
    $("[data-logout]", menu).before(entry);
  }).catch(() => {});
}

function initMobileMenu(host, active) {
  const btn = $(".menu-btn", host);
  let panel = null;
  const close = () => { panel?.remove(); panel = null; btn.innerHTML = icon("menu"); btn.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; };
  btn.addEventListener("click", () => {
    if (panel) return close();
    panel = document.createElement("nav");
    panel.className = "mobile-nav";
    panel.innerHTML = `
      <a href="/" class="${active === "home" ? "is-active" : ""}">Главная</a>
      ${NAV.map((n) => `<a href="${n.href}" class="${n.key === active ? "is-active" : ""}">${n.label}</a>`).join("")}
      ${currentUser()?.is_admin ? '<a href="/admin">Админ-панель</a>' : ""}
      <a href="${currentUser() ? "/me" : "/login"}">${currentUser() ? "Личный кабинет" : "Войти"}</a>
      <button class="btn btn--primary btn--lg" data-action="create-project">${icon("plus")}Создать проект</button>`;
    document.body.append(panel);
    document.body.style.overflow = "hidden";
    btn.innerHTML = icon("x");
    btn.setAttribute("aria-expanded", "true");
    panel.addEventListener("click", (e) => { if (e.target.closest("a, button")) close(); });
  });
  window.addEventListener("resize", () => { if (innerWidth > 960) close(); });
}

/** Тень после прокрутки; прячется при скролле вниз, появляется при скролле вверх. */
function initScrollBehaviour(host) {
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    host.classList.toggle("is-scrolled", y > 8);
    host.classList.toggle("is-hidden", y > 480 && y > lastY && !document.querySelector(".mobile-nav"));
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}
