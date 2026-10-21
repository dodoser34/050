/* Подключается обычным (не модульным) скриптом в <head> до стилей: ставит тему и уровень анимаций
   до первой отрисовки, чтобы тёмная тема не «вспыхивала» светлой. Логика та же, что в core/prefs.js. */
(function () {
  var d = document.documentElement, p = {};
  try { p = JSON.parse(localStorage.getItem("sreda:prefs") || "{}") || {}; } catch (e) { /* хранилище недоступно */ }
  var mq = function (q) { return window.matchMedia && matchMedia(q).matches; };
  var theme = p.theme === "light" || p.theme === "dark" ? p.theme : (mq("(prefers-color-scheme: dark)") ? "dark" : "light");
  var motion = p.motion === "full" || p.motion === "calm" || p.motion === "off" ? p.motion : (mq("(prefers-reduced-motion: reduce)") ? "off" : "calm");
  d.setAttribute("data-theme", theme);
  d.setAttribute("data-motion", motion);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#121116" : "#fffbf5");
})();
