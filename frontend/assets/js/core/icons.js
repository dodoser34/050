/** Набор линейных иконок 24×24. В разметке: <i data-icon="search"></i> (+ class="sm|lg"). */

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  "arrow-up-right": '<path d="M7 17 17 7M8 7h9v9"/>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M15.5 14.6c2.9-.3 5.3 1.3 6 4.4"/>',
  "user-plus": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M19 8v6M16 11h6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  heart: '<path d="M12 20s-7.5-4.6-9-9.4C1.9 7 4.2 4 7.4 4c2 0 3.6 1.1 4.6 2.7C13 5.1 14.6 4 16.6 4 19.8 4 22.1 7 21 10.6 19.5 15.4 12 20 12 20Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4.5L6 21z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  "chevron-up": '<path d="m6 15 6-6 6 6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  message: '<path d="M4 12a8 8 0 1 1 3.3 6.5L3 20l1.4-4A8 8 0 0 1 4 12Z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1.1 1.1M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.1-1.1"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 13l2 2M14.5 4.5C17 3 20 3 21 3c0 1 0 4-1.5 6.5L13 16l-5-5z"/><circle cx="15.5" cy="8.5" r="1.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
};

export function icon(name, size = "") {
  const cls = "icon" + (size ? ` icon--${size}` : "") + (name.startsWith("arrow") ? " icon--arrow" : "");
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/** Заменяет все <i data-icon> внутри root на SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach((el) => {
    const size = el.classList.contains("sm") ? "sm" : el.classList.contains("lg") ? "lg" : "";
    el.outerHTML = icon(el.dataset.icon, size);
  });
}

export const LOGO_MARK = `<svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
  <ellipse cx="16" cy="18" rx="13" ry="5" fill="none" stroke="#a996f5" stroke-width="3.4" transform="rotate(-12 16 18)"/>
  <circle cx="17" cy="14" r="7" fill="#ff6a2c"/></svg>`;
