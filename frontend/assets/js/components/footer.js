/** Подвал сайта. */
import { $ } from "../core/dom.js";
import { LOGO_MARK } from "../core/icons.js";

export function renderFooter() {
  const host = $("[data-footer]");
  if (!host) return;
  host.className = "footer";
  host.innerHTML = `
    <div class="container footer__inner">
      <div class="footer__brand">
        <a class="logo" href="/">${LOGO_MARK}Среда</a>
        <p>Платформа, где люди находят друг друга, собирают команды и превращают идеи в проекты.</p>
      </div>
      <div class="footer__col">
        <h4>Платформа</h4>
        <a href="/services">Специалисты</a>
        <a href="/services?kind=studio">Организации</a>
        <a href="/projects">Проекты</a>
        <a href="/projects?has_roles=true">Открытые роли</a>
      </div>
      <div class="footer__col">
        <h4>Компания</h4>
        <a href="/about">О нас</a>
        <a href="/about#values">Ценности</a>
        <a href="/register">Стать частью Среды</a>
      </div>
      <div class="footer__col">
        <h4>Аккаунт</h4>
        <a href="/login">Войти</a>
        <a href="/register">Регистрация</a>
        <a href="/messages">Сообщения</a>
      </div>
    </div>
    <div class="container"><div class="footer__big" aria-hidden="true">Среда</div></div>
    <div class="container footer__bottom">
      <span>© ${new Date().getFullYear()} Среда</span>
      <span>Сделано с любовью к людям и идеям</span>
    </div>`;
}
