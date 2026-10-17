/** Текущий пользователь: один запрос /api/auth/me на страницу. */
import { get, post } from "./api.js";
import { toast } from "./toast.js";

let current = null;
export const sessionReady = get("/api/auth/me").then((d) => (current = d.user)).catch(() => null);
export const currentUser = () => current;

export const loginUrl = () => "/login?next=" + encodeURIComponent(location.pathname + location.search);

/** true, если пользователь вошёл; иначе — подсказка и переход на вход. */
export async function requireAuth() {
  await sessionReady;
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
export function nextUrl() {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
