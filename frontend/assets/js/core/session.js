/** Текущий пользователь и защита от смены аккаунта в другой вкладке. */
import { get, post } from "./api.js";
import { toast } from "./toast.js";

let current = null;
let known = false, refreshing = null, reloading = false;
export const sessionReady = get("/api/auth/me").then((d) => {
  current = d.user;
  known = true;
  return current;
}).catch(() => null);
export const currentUser = () => current;

const identity = (user) => user ? `${user.id}:${Boolean(user.is_admin)}` : null;

async function refreshSession(silent = false) {
  await sessionReady;
  if (reloading) return false;
  if (!refreshing) {
    refreshing = get("/api/auth/me").then(({ user }) => {
      if (known && identity(user) !== identity(current)) {
        reloading = true;
        location.reload();
        return false;
      }
      current = user;
      known = true;
      return true;
    }).finally(() => { refreshing = null; });
  }
  try { return await refreshing; }
  catch {
    if (!silent) toast("Не удалось проверить вход. Проверьте соединение и попробуйте ещё раз", "err");
    return false;
  }
}

const checkSession = () => { refreshSession(true); };
addEventListener("storage", checkSession);
addEventListener("focus", checkSession);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkSession();
});

export const loginUrl = () => "/login?next=" + encodeURIComponent(location.pathname + location.search);

/** true, если пользователь вошёл; иначе — подсказка и переход на вход. */
export async function requireAuth() {
  if (!(await refreshSession())) return false;
  if (current) return true;
  toast("Войдите, чтобы продолжить");
  setTimeout(() => (location.href = loginUrl()), 700);
  return false;
}

export async function logout() {
  await post("/api/auth/logout").catch(() => {});
  location.reload();
}

/** Безопасный адрес возврата из ?next= (только внутренние пути). */
export function nextUrl(fallback = "/") {
  const next = new URLSearchParams(location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    const url = new URL(next, location.origin);
    if (url.origin === location.origin && !["/login", "/register"].includes(url.pathname.replace(/\/$/, ""))) return url.pathname + url.search + url.hash;
  }
  return fallback;
}
