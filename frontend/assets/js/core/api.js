/** Обёртка над fetch для JSON-API бэкенда. */

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.detail) || "Ошибка запроса");
    this.status = status;
    this.errors = (data && data.errors) || {};
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: "POST", body });
