/** Точка входа фронтенда: общие компоненты + модуль текущей страницы (body[data-page]). */
import { hydrateIcons } from "./core/icons.js";
import { initPlaceholders } from "./core/placeholders.js";
import { initActions } from "./components/actions.js";
import { renderFooter } from "./components/footer.js";
import { renderHeader } from "./components/header.js";
import { observeReveal } from "./components/reveal.js";

const PAGES = {
  home: () => import("./pages/home.js"),
  services: () => import("./pages/services.js"),
  projects: () => import("./pages/projects.js"),
  project: () => import("./pages/project.js"),
  profile: () => import("./pages/profile.js"),
  about: () => import("./pages/about.js"),
  login: () => import("./pages/auth.js"),
  register: () => import("./pages/auth.js"),
  me: () => import("./pages/me.js"),
  admin: () => import("./pages/admin.js"),
};

async function boot() {
  renderHeader();
  renderFooter();
  hydrateIcons();
  initPlaceholders();
  initActions();
  observeReveal();

  const load = PAGES[document.body.dataset.page];
  if (load) {
    try {
      const page = await load();
      await page.init?.();
    } catch (err) {
      console.error("[Среда] ошибка инициализации страницы:", err);
    }
  }
  hydrateIcons();
  observeReveal();
}

boot();
