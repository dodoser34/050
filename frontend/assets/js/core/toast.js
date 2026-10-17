/** Всплывающие уведомления внизу экрана. kind: "" | "ok" | "err" */
export function toast(text, kind = "") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    stack.setAttribute("role", "status");
    document.body.append(stack);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind ? ` toast--${kind}` : "");
  el.textContent = text;
  stack.append(el);
  setTimeout(() => el.remove(), 3600);
}
