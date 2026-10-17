/** Вход и регистрация (одна логика, разные поля). */
import { get, post } from "../core/api.js";
import { $, $$ } from "../core/dom.js";
import { icon } from "../core/icons.js";
import { currentUser, nextUrl, sessionReady } from "../core/session.js";
import { toast } from "../core/toast.js";
import { clearErrorsOnInput, showFieldErrors } from "../components/modal.js";

const FORMS = {
  login: {
    endpoint: "/api/auth/login",
    payload: (f) => ({ email: f.email.value.trim(), password: f.password.value, remember: f.remember.checked }),
  },
  register: {
    endpoint: "/api/auth/register",
    payload: (f) => ({ name: f.name.value, email: f.email.value.trim(), password: f.password.value, accept_terms: f.accept_terms.checked }),
  },
};

export async function init() {
  const form = $("[data-auth-form]");
  const cfg = FORMS[form.dataset.authForm];

  const chooseDemo = new URLSearchParams(location.search).get("demo") === "1";
  sessionReady.then(() => { if (currentUser() && !chooseDemo) location.replace(nextUrl(currentUser().is_admin ? "/admin" : "/me")); });

  $$("[data-toggle-password]", form).forEach((btn) => btn.addEventListener("click", () => {
    const input = btn.previousElementSibling, show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = icon(show ? "eye-off" : "eye");
    btn.setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
  }));
  $$("[data-google]").forEach((b) => b.addEventListener("click", () => toast("Вход через Google появится после настройки OAuth")));
  $("[data-forgot]")?.addEventListener("click", (e) => { e.preventDefault(); toast("Восстановление пароля появится в следующей версии"); });
  clearErrorsOnInput(form);
  initDemo(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form), formError = $(".form-error", form);
    formError.textContent = "";
    btn.disabled = true;
    try {
      const user = await post(cfg.endpoint, cfg.payload(form.elements));
      location.href = nextUrl(user.is_admin ? "/admin" : "/me");
    } catch (err) {
      showFieldErrors(form, err.errors);
      if (!Object.keys(err.errors || {}).length) formError.textContent = err.message || "Не удалось войти. Попробуйте ещё раз";
    } finally { btn.disabled = false; }
  });
}

/** Демо-вход расположен под основной формой, отдельно от регистрации. */
async function initDemo(form) {
  const slot = $("[data-demo-slot]");
  if (!slot) return;
  const demo = await get("/api/auth/demo").catch(() => ({ enabled: false }));
  if (!demo.enabled) return;
  const canFill = form.dataset.authForm === "login";
  slot.innerHTML = `
    <div class="demo-login">
      <h3 class="demo-login__title">Попробовать без регистрации</h3>
      <p class="demo-login__intro">Выберите роль и посмотрите, как работает Среда.</p>
      <div class="demo-login__row">
        <button type="button" class="demo-login__card" data-demo="user" aria-label="Демо-вход: пользователь">
          <span class="demo-login__icon">${icon("users")}</span>
          <span><strong>Пользователь</strong><small>Анкета, проекты и отклики</small></span>${icon("arrow-up-right", "sm")}
        </button>
        <button type="button" class="demo-login__card demo-login__card--admin" data-demo="admin" aria-label="Демо-вход: администратор">
          <span class="demo-login__icon">${icon("shield")}</span>
          <span><strong>Администратор</strong><small>Модерация и управление</small></span>${icon("arrow-up-right", "sm")}
        </button>
      </div>
      ${demo.local ? '<p class="demo-login__note">Это демоверсия: аккаунты и изменения сохраняются только в вашем браузере. Для регистрации используйте вымышленные данные и отдельный пароль.</p>' : ""}
      ${canFill ? '<button type="button" class="demo-login__fill" data-demo-fill>Подставить демо-логин и пароль в форму</button>' : ""}
    </div>`;
  $$("[data-demo]", slot).forEach((btn) => btn.addEventListener("click", async () => {
    const role = btn.dataset.demo;
    $$("[data-demo]", slot).forEach((b) => { b.disabled = true; });
    try {
      await post("/api/auth/demo", { role });
      toast(role === "admin" ? "Вы вошли как администратор" : "Вы вошли в демо-аккаунт", "ok");
      location.href = nextUrl(role === "admin" ? "/admin" : "/me");
    } catch (err) {
      toast(err.message, "err");
      $$("[data-demo]", slot).forEach((b) => { b.disabled = false; });
    }
  }));
  $("[data-demo-fill]", slot)?.addEventListener("click", () => {
    form.elements.email.value = demo.email;
    form.elements.password.value = demo.password;
    form.elements.email.dispatchEvent(new Event("input"));
    form.elements.password.dispatchEvent(new Event("input"));
    $("button[type=submit]", form).focus();
  });
}
