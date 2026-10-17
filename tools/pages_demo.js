/** Scope and role switcher, included only in the static export. */
import { get, post } from "./api.js";
import { esc } from "./dom.js";
const BASE = __BASE_PATH__;
export async function initPagesDemo() {
  const banner = document.createElement("aside");
  banner.className = "container demo-banner";
  banner.setAttribute("aria-label", "Демонстрационная версия");
  document.querySelector("header")?.after(banner);
  try {
    const { user } = await get(BASE + "api/auth/me");
    banner.innerHTML = `<div><strong>Демо · ${user ? user.is_admin ? "Администратор" : "Пользователь" : "Гость"}</strong>
      <p>Регистрация и изменения сохраняются только в этом браузере. Используйте вымышленные данные и отдельный пароль.</p>
      ${user ? `<small>${esc(user.name)}</small>` : `<a class="link" href="${BASE}register/">Создать демо-аккаунт</a>`}</div>
      <div class="demo-banner__actions" aria-label="Посмотреть возможности роли">
        <button type="button" class="btn btn--sm ${user?.id === 1 ? "btn--primary" : "btn--outline"}" data-demo-role="user">Я пользователь</button>
        <button type="button" class="btn btn--sm ${user?.id === 2 ? "btn--primary" : "btn--outline"}" data-demo-role="admin">Я администратор</button>
      </div>`;
    banner.addEventListener("click", async (event) => {
      const btn = event.target.closest("[data-demo-role]");
      if (!btn) return;
      banner.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        await post(BASE + "api/auth/demo", { role: btn.dataset.demoRole });
        location.href = BASE + (btn.dataset.demoRole === "admin" ? "admin/" : "me/");
      } catch (error) {
        banner.querySelector("p").textContent = error.message;
        banner.querySelectorAll("button").forEach((b) => { b.disabled = false; });
      }
    });
  } catch (error) { banner.textContent = error.message; }
}
