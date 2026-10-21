/** Заглушки для ещё не сгенерированных картинок (prompts/images.prompt).
 *  <img data-fb="avatar|cover|art" data-label="…" data-variant="…"> — если файла нет,
 *  подставляется SVG в фирменной палитре. */

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const uri = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PALETTES = [
  ["#EEEAFF", "#B9A9FF", "#FF6A2C"], ["#FFEDE3", "#FF9A6A", "#6C55F5"], ["#E7F4EC", "#8CCBA8", "#6C55F5"],
  ["#F4EEE6", "#D7C3A6", "#FF6A2C"], ["#E7EDFF", "#8FA8F7", "#FF8A55"], ["#FFF2DF", "#FFC071", "#6C55F5"],
];
const DEFS = `<defs>
  <linearGradient id="lv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCD3FF"/><stop offset=".5" stop-color="#A996F5"/><stop offset="1" stop-color="#7D67E6"/></linearGradient>
  <radialGradient id="or" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFC0A0"/><stop offset=".55" stop-color="#FF6A2C"/><stop offset="1" stop-color="#D9480F"/></radialGradient>
  <radialGradient id="lvb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#EAE4FF"/><stop offset=".6" stop-color="#A996F5"/><stop offset="1" stop-color="#6C55F5"/></radialGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFB27F" stop-opacity=".9"/><stop offset="1" stop-color="#FFB27F" stop-opacity="0"/></radialGradient>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur stdDeviation="18"/></filter></defs>`;
const initialsOf = (label) => xml(String(label || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase());

function avatarSvg(label) {
  const [bg, mid, acc] = PALETTES[hash(label) % PALETTES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g)"/><circle cx="160" cy="40" r="22" fill="${acc}" opacity=".85"/>
    <text x="100" y="124" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="700" font-size="64" fill="#111114" fill-opacity=".78">${initialsOf(label)}</text></svg>`;
}

function coverSvg(label) {
  const h = hash(label), [bg, mid, acc] = PALETTES[h % PALETTES.length];
  const x = 300 + (h % 900), y = 250 + ((h >> 8) % 400), r = 140 + ((h >> 4) % 90), rot = (h >> 12) % 60 - 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">${DEFS}
    <defs><linearGradient id="bgc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#FFFBF5"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#bgc)"/>
    <ellipse cx="800" cy="520" rx="640" ry="180" transform="rotate(${rot} 800 520)" fill="none" stroke="${mid}" stroke-width="4" opacity=".7"/>
    <rect x="${1600 - x - 260}" y="${y - 40}" width="560" height="150" rx="75" transform="rotate(${rot} ${1600 - x} ${y})" fill="url(#lv)"/>
    <circle cx="${x}" cy="${y + 60}" r="${r + 30}" fill="#5b4aa8" opacity=".12" filter="url(#sh)"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${acc === "#6C55F5" ? "url(#lvb)" : "url(#or)"}"/>
    <circle cx="${(x + 700) % 1500 + 50}" cy="${(y + 300) % 800 + 100}" r="34" fill="url(#lvb)"/></svg>`;
}

const ART = {
  services: `<ellipse cx="800" cy="520" rx="600" ry="190" transform="rotate(-8 800 520)" fill="none" stroke="#B9A9FF" stroke-width="4"/>
    <circle cx="800" cy="560" r="150" fill="#5b4aa8" opacity=".12" filter="url(#sh)"/><circle cx="800" cy="520" r="120" fill="url(#or)"/>
    <g transform="rotate(-32 380 330)"><rect x="210" y="300" width="300" height="62" rx="31" fill="url(#lv)"/><path d="M510 300 L590 331 L510 362 Z" fill="#FF8A55"/></g>
    <g fill="none" stroke="url(#lv)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"><path d="M1140 230 L1080 300 L1140 370"/><path d="M1300 230 L1360 300 L1300 370"/></g>
    <g><rect x="1150" y="640" width="230" height="160" rx="36" fill="url(#lv)"/><circle cx="1265" cy="720" r="52" fill="#FFFBF5"/><circle cx="1265" cy="720" r="32" fill="url(#or)"/></g>
    <g><rect x="360" y="610" width="96" height="170" rx="48" fill="url(#or)"/><path d="M330 720 a78 78 0 0 0 156 0" fill="none" stroke="#A996F5" stroke-width="16" stroke-linecap="round"/></g>`,
  projects: `<ellipse cx="800" cy="880" rx="560" ry="40" fill="#5b4aa8" opacity=".12" filter="url(#sh)"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${380 + i * 180}" y="${720 - i * 110}" width="160" height="${140 + i * 110}" rx="34" fill="url(#lv)"/>`).join("")}
    <circle cx="820" cy="430" r="80" fill="url(#or)"/><rect x="1170" y="170" width="10" height="160" rx="5" fill="#111114" opacity=".75"/><path d="M1180 172 L1290 205 L1180 240 Z" fill="#FF6A2C"/>`,
  about: `<ellipse cx="800" cy="745" rx="520" ry="110" fill="#F4F0FF"/><circle cx="800" cy="520" r="230" fill="url(#glow)"/>
    <circle cx="800" cy="560" r="96" fill="url(#or)"/><circle cx="430" cy="610" r="104" fill="url(#lvb)"/>
    <rect x="1060" y="500" width="190" height="190" rx="44" fill="url(#lv)"/><circle cx="980" cy="740" r="62" fill="none" stroke="#FF8A55" stroke-width="40"/>`,
  auth: `<ellipse cx="800" cy="884" rx="420" ry="60" fill="#F4F0FF"/><circle cx="800" cy="600" r="300" fill="url(#glow)"/>
    <path d="M560 870 V540 A240 240 0 0 1 1040 540 V870" fill="none" stroke="url(#lv)" stroke-width="100" stroke-linecap="round"/>
    <circle cx="400" cy="790" r="76" fill="url(#or)"/><ellipse cx="800" cy="500" rx="560" ry="150" transform="rotate(-12 800 500)" fill="none" stroke="#B9A9FF" stroke-width="3"/>`,
  banner: `<rect width="2400" height="400" fill="#ECE6FF"/>
    <path d="M700 480 C900 100 1200 40 1400 240 C1600 440 1800 100 2000 40" fill="none" stroke="url(#lv)" stroke-width="130" stroke-linecap="round"/>
    <circle cx="2120" cy="300" r="170" fill="url(#or)"/>`,
};

function artSvg(variant) {
  if (variant === "banner") return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 400" preserveAspectRatio="xMidYMid slice">${DEFS}${ART.banner}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">${DEFS}${ART[variant] || ART.services}</svg>`;
}

function applyFallback(img) {
  // тёмной версии иллюстрации ещё нет — показываем светлую, а не векторную заглушку
  if (img.dataset.dark && img.dataset.light && img.getAttribute("src") === img.dataset.dark) {
    img.dataset.darkMissing = "1";
    img.src = img.dataset.light;
    return;
  }
  if (img.dataset.fbDone) return;
  img.dataset.fbDone = "1";
  const label = img.dataset.label || img.alt || "";
  const kind = img.dataset.fb;
  img.src = uri(kind === "avatar" ? avatarSvg(label) : kind === "art" ? artSvg(img.dataset.variant) : coverSvg(label));
}

export function initPlaceholders() {
  window.addEventListener("error", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.dataset && t.dataset.fb) applyFallback(t);
  }, true);
  document.querySelectorAll("img[data-fb]").forEach((img) => {
    if (img.complete && img.naturalWidth === 0) applyFallback(img);
  });
}

/** <img> с заглушкой. kind: avatar | cover | art */
export function imgTag(src, kind, label, attrs = "") {
  const safe = String(label ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const image = src || uri(kind === "avatar" ? avatarSvg(label) : kind === "art" ? artSvg() : coverSvg(label));
  return `<img src="${image}" alt="" data-fb="${kind}" data-label="${safe}" loading="lazy" ${attrs}>`;
}
