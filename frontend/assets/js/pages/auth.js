/** Вход и регистрация (одна логика, разные поля). */
import { get, post } from "../core/api.js";
import { $, $$, esc } from "../core/dom.js";
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

  sessionReady.then(() => { if (currentUser()) location.replace(nextUrl(currentUser().is_admin ? "/admin" : "/me")); });

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
      if (!Object.keys(err.errors).length) formError.textContent = err.message;
    } finally { btn.disabled = false; }
  });
}

/** Демо-вход: кнопка «войти без регистрации» и подстановка демо-логина в форму входа. */
async function initDemo(form) {
  const slot = $("[data-demo-slot]");
  if (!slot) return;
  const demo = await get("/api/auth/demo").catch(() => ({ enabled: false }));
  if (!demo.enabled) return;
  const canFill = form.dataset.authForm === "login";
  slot.innerHTML = `
    <div class="demo-login">
      <div class="demo-login__row">
        <button type="button" class="btn btn--outline-orange demo-login__btn" data-demo="user">${icon("sparkle")}Демо-вход</button>
        <button type="button" class="btn btn--outline demo-login__btn" data-demo="admin">${icon("shield")}Демо-админ</button>
      </div>
      ${canFill ? `<p class="demo-login__creds">или вручную: <button type="button" class="demo-login__fill" data-demo-fill title="Подставить в форму">${esc(demo.email)} · ${esc(demo.password)}</button></p>`
                : '<p class="demo-login__creds">Посмотрите сайт изнутри без регистрации: свой проект, лайки и отклики уже есть.</p>'}
    </div>`;
  $$("[data-demo]", slot).forEach((btn) => btn.addEventListener("click", async () => {
    const role = btn.dataset.demo;
    btn.disabled = true;
    try {
      await post("/api/auth/demo", { role });
      toast(role === "admin" ? "Вы вошли как администратор" : "Вы вошли в демо-аккаунт", "ok");
      location.href = nextUrl(role === "admin" ? "/admin" : "/me");
    } catch (err) {
      toast(err.message, "err");
      btn.disabled = false;
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
