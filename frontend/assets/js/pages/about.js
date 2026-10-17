/** «О нас»: живые цифры платформы. */
import { get } from "../core/api.js";
import { $ } from "../core/dom.js";
import { observeReveal } from "../components/reveal.js";

export async function init() {
  const [people, projects, meta] = await Promise.all([
    get("/api/specialists"), get("/api/projects?limit=1"), get("/api/specialists/meta"),
  ]);
  const set = (key, n) => { const el = $(`[data-stat="${key}"]`); if (el) el.dataset.count = n; };
  set("people", people.total);
  set("projects", projects.total);
  set("cities", meta.cities.length);
  set("directions", meta.directions.length);
  observeReveal($("#stats"));
}
