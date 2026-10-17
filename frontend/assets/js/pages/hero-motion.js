import { esc } from "../core/dom.js";

/** Главная: моушен-hero. Порт композиции из Claude Design («Среда - Hero Motion.html», hero-motion-v2.jsx)
 на чистый JS: те же координаты сцены 1000×750, тайминги и easing.
 Секции: Assemble 0–1.7 с → Drop 1.7–2.5 → Connect 2.5–4.5 → Live 4.5–10.5 (дальше Live крутится по кругу).
 Hero полностью векторный: картинок-слоёв нет, чтобы ничего не наслаивалось на анимацию. */

// ---------- Easing / помощники (как в animations-v3.jsx) ----------
const Easing = {
  easeInQuad: (t) => t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
const MOTION = { enter: Easing.easeOutCubic, draw: Easing.easeInOutCubic, pop: Easing.easeOutBack };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const prog = (T, s, d) => clamp((T - s) / d, 0, 1);
// ноль в начале и в конце 6-секундной секции — шов цикла незаметен
const drift = (u, amp, phase, period = 6) => amp * (Math.sin(2 * Math.PI * u / period + phase) - Math.sin(phase));

const CUES = { Assemble: 0, Drop: 1.7, Connect: 2.5, Live: 4.5 };
const LIVE = 6;
const C = { lav: "#A996F5", lavDeep: "#6C55F5", orange: "#FF6A2C" };

// ---------- Геометрия сцены ----------
const ORBITS = [
  { cx: 560, cy: 440, rx: 470, ry: 120, rot: -10 },
  { cx: 520, cy: 380, rx: 330, ry: 235, rot: 28 },
  { cx: 650, cy: 470, rx: 240, ry: 72, rot: -18 },
];
const BEADS = [
  { x: 110, y: 520, r: 11, c: C.orange },
  { x: 925, y: 345, r: 9, c: "#B6A6FF" },
  { x: 385, y: 95, r: 8, c: "#B6A6FF" },
];
const ellPt = (deg) => {
  const r = deg * Math.PI / 180, c = Math.cos(-10 * Math.PI / 180), sn = Math.sin(-10 * Math.PI / 180);
  const x = 280 * Math.cos(r), y = 80 * Math.sin(r);
  return [Math.round(640 + x * c - y * sn), Math.round(520 + x * sn + y * c)];
};
// кольцо вокруг шара (задняя половина за ним, передняя — перед) + хвост, уходящий в высокую петлю слева
const KNOT = {
  back: "M916,471 A280 80 -10 0 0 364,569",
  front: "M916,471 A280 80 -10 0 1 364,569",
  tail: "M455,215 C340,140 190,230 240,390 C265,470 350,490 364,569",
};
// слоты людей; роли и аватары подставляются из команды проекта
const SLOTS = [
  { f: [384, 189], t: [205, 95], r: 36, bg: ["#E9E3FF", "#C9BCFF"] },
  // у обоих нижних людей подпись слева: так подписи не пересекаются и не уходят за край на ноутбуках
  { f: ellPt(140), t: [290, 712], r: 30, bg: ["#FFE6D6", "#FFC2A0"], label: "left" },
  { f: ellPt(90), t: [740, 712], r: 26, bg: ["#E9E3FF", "#B9A8FA"] },
  { f: ellPt(20), t: [945, 625], r: 30, bg: ["#FFE6D6", "#FFB48A"] },
  { f: ellPt(-50), t: [815, 110], r: 38, bg: ["#EDE8FF", "#CFC3FF"] },
];
const NEURONS = [
  { ...SLOTS[0], person: 0 },
  { f: [232, 303], t: [95, 330] },
  { ...SLOTS[1], person: 1 },
  { ...SLOTS[2], person: 2 },
  { ...SLOTS[3], person: 3 },
  { f: ellPt(-25), t: [980, 390] },
  { ...SLOTS[4], person: 4 },
];
const NEURON_OF = SLOTS.map((_, k) => NEURONS.findIndex((n) => n.person === k));
const curve = (f, t) => {
  const mx = (f[0] + t[0]) / 2, my = (f[1] + t[1]) / 2, dx = t[0] - f[0], dy = t[1] - f[1], k = 0.12;
  return `M${f[0]},${f[1]} Q${mx - dy * k},${my + dx * k} ${t[0]},${t[1]}`;
};
const avatarPos = (p) => {
  const dx = p.t[0] - p.f[0], dy = p.t[1] - p.f[1], L = Math.hypot(dx, dy);
  return [p.t[0] + dx / L * (p.r + 12), p.t[1] + dy / L * (p.r + 12)];
};

// ---------- SVG ----------
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const set = (e, attrs) => { for (const k in attrs) e.setAttribute(k, attrs[k]); };

const DEFS = `
  <linearGradient id="hm-orbit" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0" spreadMethod="reflect">
    <stop offset="0" stop-color="#8B74F6"/><stop offset=".5" stop-color="#FF8A55"/><stop offset="1" stop-color="#B6A6FF"/>
  </linearGradient>
  <linearGradient id="hm-tube" gradientUnits="userSpaceOnUse" x1="220" y1="120" x2="820" y2="680">
    <stop offset="0" stop-color="#D6CCFF"/><stop offset=".5" stop-color="#A996F5"/><stop offset="1" stop-color="#7D67E6"/>
  </linearGradient>
  <radialGradient id="hm-ball" cx=".36" cy=".3" r=".8">
    <stop offset="0" stop-color="#FF9C66"/><stop offset=".55" stop-color="#FF6A2C"/><stop offset="1" stop-color="#E2511A"/>
  </radialGradient>
  <radialGradient id="hm-rim" cx=".5" cy=".5" r=".5">
    <stop offset=".78" stop-color="#B83A0A" stop-opacity="0"/><stop offset="1" stop-color="#B83A0A" stop-opacity=".28"/>
  </radialGradient>
  <filter id="hm-velvet" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="4" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0" result="w"/>
    <feComposite in="w" in2="SourceGraphic" operator="in" result="wn"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="wn"/></feMerge>
  </filter>
  <filter id="hm-soft4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="hm-soft6" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="hm-soft18" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="18"/></filter>`;

function tube(parent, d) {
  const dash = { pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1, fill: "none", "stroke-linecap": "round" };
  return [
    el("path", { d, ...dash, stroke: "#5B44C9", "stroke-opacity": .22, "stroke-width": 72, transform: "translate(5 9)", filter: "url(#hm-soft6)" }, parent),
    el("path", { d, ...dash, stroke: "url(#hm-tube)", "stroke-width": 72 }, parent),
    el("path", { d, ...dash, stroke: "#fff", "stroke-opacity": .38, "stroke-width": 16, transform: "translate(-9 -12)", filter: "url(#hm-soft4)" }, parent),
  ];
}
const setTube = (paths, off) => paths.forEach((p) => p.setAttribute("stroke-dashoffset", off));

function build(stage) {
  const svg = el("svg", { viewBox: "0 0 1000 750", class: "hm-svg", "aria-hidden": "true" });
  svg.innerHTML = `<defs>${DEFS}</defs>`;
  const S = { svg };
  S.orbitGrad = svg.querySelector("#hm-orbit");

  const gOrb = el("g", { class: "layer-orbits" }, svg);
  S.orbits = ORBITS.map((o) => el("ellipse", { cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry, transform: `rotate(${o.rot} ${o.cx} ${o.cy})`,
    fill: "none", stroke: "url(#hm-orbit)", "stroke-width": 2, pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1, opacity: 0 }, gOrb));
  S.beads = BEADS.map((b) => {
    const g = el("g", { transform: `translate(${b.x} ${b.y}) scale(0)` }, gOrb);
    el("circle", { r: b.r, fill: b.c }, g);
    el("circle", { r: b.r * .45, cx: -b.r * .3, cy: -b.r * .35, fill: "#fff", opacity: .35 }, g);
    return g;
  });

  S.back = el("g", { class: "layer-knot-back" }, svg);
  S.backTubes = [...tube(S.back, KNOT.back), ...tube(S.back, KNOT.tail)];

  S.shadow = el("g", { class: "layer-shadow", opacity: 0 }, svg);
  el("ellipse", { cx: 640, cy: 700, rx: 360, ry: 34, fill: "#5B4A8A", opacity: .18, filter: "url(#hm-soft18)" }, S.shadow);

  S.ball = el("g", { class: "layer-ball" }, svg);
  [
    el("circle", { cx: 650, cy: 470, r: 120, fill: "url(#hm-ball)", filter: "url(#hm-velvet)" }, S.ball),
    el("circle", { cx: 650, cy: 470, r: 120, fill: "url(#hm-rim)" }, S.ball),
    el("ellipse", { cx: 605, cy: 415, rx: 42, ry: 30, fill: "#fff", opacity: .18, filter: "url(#hm-soft18)" }, S.ball),
  ];

  S.front = el("g", { class: "layer-knot-front" }, svg);
  S.frontTubes = tube(S.front, KNOT.front);

  const gRip = el("g", {}, svg);
  S.ripples = [0, 0.16].map((o) => ({ o, e: el("ellipse", { cx: 650, cy: 592, fill: "none", stroke: C.orange, display: "none" }, gRip) }));

  const gN = el("g", { class: "layer-neurons" }, svg);
  S.neurons = NEURONS.map((n, i) => {
    const d = curve(n.f, n.t);
    const g = el("g", {}, gN);
    const color = i % 2 ? C.orange : C.lavDeep;
    const wire = el("path", { d, fill: "none", stroke: C.lav, "stroke-opacity": .85, "stroke-width": 1.8, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 }, g);
    const runs = [0, 1].map(() => {
      const rg = el("g", { display: "none" }, g);
      const spark = { "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": ".14 2", fill: "none" };
      return { g: rg, paths: [
        el("path", { d, ...spark, stroke: "#FF8A55", "stroke-width": 7, opacity: .45, filter: "url(#hm-soft4)" }, rg),
        el("path", { d, ...spark, stroke: C.orange, "stroke-width": 2.6 }, rg),
      ] };
    });
    const rings = [0, 1].map(() => el("circle", { cx: n.t[0], cy: n.t[1], fill: "none", stroke: color, "stroke-width": 1.5, display: "none" }, g));
    const node = el("g", { transform: `translate(${n.t[0]} ${n.t[1]}) scale(0)` }, g);
    el("circle", { r: 5, fill: "#fff", stroke: color, "stroke-width": 2 }, node);
    return { n, wire, runs, rings, node };
  });

  stage.prepend(svg);
  return S;
}

// ---------- Люди ----------
function buildPeople(box, team) {
  box.innerHTML = SLOTS.map((p, k) => {
    const m = team[k];
    if (!m) return "";
    const [x, y] = avatarPos(p);
    const ini = esc(m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(""));
    return `<a class="hm-person ${(p.label ? p.label === "left" : x > 500) ? "is-right" : ""}" href="/people/${esc(m.slug)}" data-k="${k}"
        style="left:${x / 10}%;top:${y / 7.5}%;--size:${p.r * 2}">
        <span class="hm-ava" style="background:linear-gradient(145deg,${p.bg[0]},${p.bg[1]})">${ini}
          <img src="${esc(m.avatar)}" alt="${esc(m.name)}" onerror="this.remove()">
        </span>
        <span class="hm-label"><span class="hm-dot" style="background:${k % 2 ? C.orange : C.lavDeep}"></span>${esc(m.role)}</span>
      </a>`;
  }).join("");
  return [...box.querySelectorAll(".hm-person")];
}

// ---------- Кадр ----------
function ballState(T) {
  const d = CUES.Drop, hit = d + 0.45;
  let y = 470, sx = 1, sy = 1;
  if (T < d) y = -420;
  else if (T < hit) y = -420 + (470 + 420) * Easing.easeInQuad(prog(T, d, 0.45));
  else if (T < hit + 0.1) { const s = Math.sin(Math.PI * prog(T, hit, 0.1)); sx = 1 + 0.03 * s; sy = 1 - 0.05 * s; }
  else if (T < hit + 0.4) { const u = prog(T, hit + 0.1, 0.3); y = 470 - 52 * 4 * u * (1 - u); }
  else if (T < hit + 0.46) { const s = Math.sin(Math.PI * prog(T, hit + 0.4, 0.06)); sx = 1 + 0.012 * s; sy = 1 - 0.02 * s; }
  else if (T < hit + 0.62) { const u = prog(T, hit + 0.46, 0.16); y = 470 - 11 * 4 * u * (1 - u); }
  if (T > CUES.Live) y -= drift(T - CUES.Live, 10.5, 0);
  return { y, sx, sy };
}

function render(H, T, wall) {
  const { S } = H;
  const live = Math.max(0, T - CUES.Live);

  H.bg.style.opacity = MOTION.enter(prog(T, 0, 0.8));
  H.enter.forEach(([node, at]) => {
    const p = MOTION.enter(prog(T, at, 0.55));
    node.style.opacity = p;
    node.style.transform = `translateY(${(1 - p) * 12}px)`;
  });

  // орбиты: градиент «течёт» по реальному времени, чтобы не прыгал на шве цикла
  S.orbitGrad.setAttribute("gradientTransform", `translate(${((wall / 7) * 1200) % 1200} 0)`);
  S.orbits.forEach((e, i) => {
    const p = MOTION.draw(prog(T, 0.2 + i * 0.25, 1.1));
    set(e, { "stroke-dashoffset": 1 - p, opacity: p > 0 ? 0.4 : 0 });
  });
  S.beads.forEach((g, i) => {
    const s = MOTION.pop(prog(T, 1.4 + i * 0.1, 0.4)), b = BEADS[i];
    g.setAttribute("transform", `translate(${b.x} ${b.y + drift(live, 4, i * 2.1, 3)}) scale(${s})`);
  });

  const pb = MOTION.draw(prog(T, 0.4, 1.4));
  setTube(S.backTubes, 1 - pb);
  const pf = MOTION.draw(prog(T, 0.9, 1.1));
  setTube(S.frontTubes, 1 - pf);

  const ps = MOTION.enter(prog(T, 0.4, 1.2));
  set(S.shadow, { opacity: ps, transform: `translate(640 705) scale(${0.96 + 0.04 * ps}) translate(-640 -705)` });

  const { y, sx, sy } = ballState(T);
  S.ball.setAttribute("transform", `translate(0 ${y - 470}) translate(650 590) scale(${sx} ${sy}) translate(-650 -590)`);

  const at = CUES.Drop + 0.55;
  S.ripples.forEach(({ o, e }) => {
    const p = prog(T, at + o, 0.9);
    if (p <= 0 || p >= 1) { e.setAttribute("display", "none"); return; }
    const s = 0.6 + 1.2 * MOTION.enter(p);
    set(e, { display: "inline", rx: 160 * s, ry: 40 * s, "stroke-width": 2.5 / s, opacity: 0.7 * (1 - p) });
  });

  S.neurons.forEach((N, i) => {
    const s1 = CUES.Connect + i * 0.12, s2 = CUES.Live + 3.0 + i * 0.12;
    N.wire.setAttribute("stroke-dashoffset", 1 - MOTION.enter(prog(T, s1, 0.7)));
    [s1, s2].forEach((s, k) => {
      const p = prog(T, s, 0.7), r = N.runs[k];
      if (p <= 0 || p >= 1) { r.g.setAttribute("display", "none"); return; }
      set(r.g, { display: "inline", opacity: Math.min(1, (1 - p) * 4) });
      r.paths.forEach((path) => path.setAttribute("stroke-dashoffset", 0.14 - p * 1.14));
    });
    [s1 + 0.62, s2 + 0.62].forEach((a, k) => {
      const q = prog(T, a, 0.7), ring = N.rings[k];
      if (q <= 0 || q >= 1) { ring.setAttribute("display", "none"); return; }
      set(ring, { display: "inline", r: 5 * (1 + 0.9 * MOTION.enter(q)), opacity: 0.6 * (1 - q) });
    });
    N.node.setAttribute("transform", `translate(${N.n.t[0]} ${N.n.t[1]}) scale(${MOTION.pop(prog(T, s1 + 0.62, 0.4))})`);
  });

  H.people.forEach((a) => {
    const k = +a.dataset.k;
    const t0 = CUES.Connect + NEURON_OF[k] * 0.12 + 0.6;
    const e = prog(T, t0, 0.6);
    const s = 0.6 + 0.4 * MOTION.pop(e);
    const dy = (1 - MOTION.enter(e)) * 26 + drift(live, 6, k * 1.3);
    a.style.opacity = MOTION.enter(prog(T, t0, 0.3));
    a.style.transform = `translate(-50%,-50%) translateY(${dy}px) scale(${s})`;
    const lp = MOTION.enter(prog(T, t0 + 0.08, 0.5));
    const lab = a.lastElementChild;
    lab.style.opacity = lp;
    lab.style.transform = `translateY(-50%) translateX(${(1 - lp) * (a.classList.contains("is-right") ? 12 : -12)}px)`;
  });

  const cap = MOTION.enter(prog(T, CUES.Connect + 1.5, 0.6));
  H.caption.style.opacity = cap;
  H.caption.style.transform = `translateY(${(1 - cap) * 8}px)`;
  if (H.hint) H.hint.style.opacity = MOTION.enter(prog(T, 0.5, 0.6));
}

async function loadTeam(H) {
  try {
    const r = await fetch("/api/projects?limit=50").then((x) => x.json());
    // проект с самой большой командой — по умолчанию «Пульс» (5 человек, роли совпадают со слотами)
    const p = [...r.items].sort((a, b) => b.team.length - a.team.length || b.likes - a.likes)[0];
    if (!p) return;
    H.people = buildPeople(H.peopleBox, p.team);
    H.caption.innerHTML = `Команда проекта <a href="/projects?q=${encodeURIComponent(p.title)}">«${esc(p.title)}»</a>`;
    const open = await fetch("/api/projects?has_roles=true&limit=1").then((x) => x.json());
    const note = document.getElementById("hero-note");
    if (note) note.textContent = `Сейчас ${open.total} ${open.total % 10 === 1 && open.total % 100 !== 11 ? "команда ищет" : "команд ищут"} участников`;
  } catch (e) { /* hero работает и без людей */ }
}

export function initHeroMotion() {
  const stage = document.getElementById("hero-stage");
  if (!stage) return;
  const H = {
    S: build(stage),
    bg: document.querySelector(".hero__bg"),
    peopleBox: document.getElementById("hero-people"),
    caption: document.getElementById("hero-caption"),
    hint: document.querySelector(".hero__cue"),
    enter: [...document.querySelectorAll("[data-enter]")].map((n) => [n, parseFloat(n.dataset.enter)]),
    people: [],
  };
  // масштаб аватаров = ширина сцены / 1000
  const fit = () => stage.style.setProperty("--k", stage.clientWidth / 1000);
  fit();
  new ResizeObserver(fit).observe(stage);
  loadTeam(H);

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ?hero-t=6 — открыть сразу на нужной секунде (для отладки и скриншотов)
  const startAt = parseFloat(new URLSearchParams(location.search).get("hero-t")) || 0;
  const timeToT = (x) => (x < CUES.Live + LIVE ? x : CUES.Live + ((x - CUES.Live) % LIVE));

  // Время идёт по реальным часам (не по числу кадров), поэтому анимация не «тормозит» при редких кадрах.
  // Пока hero вне экрана или вкладка скрыта — часы стоят.
  let origin = performance.now() - startAt * 1000, pausedAt = null, running = false;
  const now = () => (performance.now() - origin) / 1000;
  const frame = () => {
    if (pausedAt != null) { running = false; return; }
    const t = now();
    render(H, reduce ? CUES.Live : timeToT(t), t);
    if (reduce) { running = false; return; }
    requestAnimationFrame(frame);
  };
  const resume = () => {
    if (pausedAt != null) { origin += performance.now() - pausedAt; pausedAt = null; }
    if (!running) { running = true; requestAnimationFrame(frame); }
  };
  const pause = () => { if (pausedAt == null) pausedAt = performance.now(); };

  resume();
  if (reduce) setTimeout(() => render(H, CUES.Live, 0), 400); // люди догружаются из API

  let onScreen = true;
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    onScreen && !document.hidden ? resume() : pause();
  }).observe(stage);
  document.addEventListener("visibilitychange", () => (document.hidden || !onScreen ? pause() : resume()));

  // клик по сцене — проиграть заново
  stage.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    origin = performance.now();
    if (reduce) render(H, CUES.Live, 0);
  });
}
