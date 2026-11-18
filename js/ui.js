// Building blocks: icons, elements, bottom sheets, dialogs, toasts - all in the calm Homebase look.

const P = {
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><rect x="10" y="14" width="4" height="6" rx="1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v3.5M16 3v3.5"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.5l3 3 5.5-6.5"/>',
  tick: '<path d="M5 12.5l5 5 9-10.5"/>',
  note: '<path d="M5 3.5h10l4 4v13H5z"/><path d="M15 3.5v4h4M8.5 12h7M8.5 15.5h5"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M5.5 6L15 3.5 16.5 6"/><rect x="14" y="11" width="7" height="4.5" rx="2"/>',
  repeat: '<path d="M18.5 8A7.5 7.5 0 0 0 5 9.5M5.5 16A7.5 7.5 0 0 0 19 14.5"/><path d="M18.8 4.5v4h-4M5.2 19.5v-4h4"/>',
  cart: '<path d="M2.5 4h3L8 15.5h10.5l2-8H6.5"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  pot: '<path d="M4.5 10v7l2 3h11l2-3v-7M2.5 10h19"/><path d="M9 8.5a3 3 0 0 1 6 0"/>',
  sparkle: '<path d="M10 3l1.7 5.3L17 10l-5.3 1.7L10 17l-1.7-5.3L3 10l5.3-1.7z"/><path d="M17.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>',
  bolt: '<path d="M13.5 2.5L5 13.5h6.5l-1 8 8.5-11h-6.5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 6.5h16M9 6.5V4h6v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"/>',
  bell: '<path d="M5 17l1.5-2v-4.5a5.5 5.5 0 0 1 11 0V15l1.5 2z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
  gift: '<rect x="4" y="10" width="16" height="10.5" rx="2"/><rect x="3" y="7" width="18" height="3.5" rx="1.5"/><path d="M12 7v13.5M12 7C9 2.5 5.5 4.5 8 7M12 7c3-4.5 6.5-2.5 4 0"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  download: '<path d="M12 3.5V15M7.5 10.5L12 15l4.5-4.5M4 14v6h16v-6"/>',
  upload: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M4 14v6h16v-6"/>',
  down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>', trend: '<path d="M3 6l6 6 4-3 8 9M15 18h6v-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  bank: '<path d="M3.5 9.5L12 4.5l8.5 5"/><path d="M5.5 10.5v7M10 10.5v7M14 10.5v7M18.5 10.5v7M3.5 20h17"/>',
  cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  pig: '<path d="M5 11.5c0-3.3 3.1-5.5 7-5.5 1.6 0 3 .3 4.2 1l2.3-1.2-.4 2.8c.9.8 1.5 1.8 1.7 2.9H21v3h-1.4c-.5 1.2-1.4 2.2-2.6 2.9V20h-2.5v-1.3a9 9 0 0 1-3.5 0V20H8.5v-2.1C6.3 16.8 5 14.4 5 11.5z"/><circle cx="15.5" cy="10.5" r=".7"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
};

// The main icons in one drawn style: rounded, outlined - and filled for the page you're on (tab bar).
// Details on a filled icon are "cut out" in the background colour.
const CUT = 'stroke="var(--bg)"';
const MAIN = {
  home: [`<path d="M3.5 11L12 4l8.5 7v9.5h-6v-6h-5v6h-6z"/>`,
         `<path d="M3.5 11L12 4l8.5 7v9.5h-6v-6h-5v6h-6z" fill="currentColor"/>`],
  check: [`<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 12.2l2.4 2.4 4.8-5"/>`,
          `<rect x="4" y="4" width="16" height="16" rx="5" fill="currentColor"/><path d="M8.5 12.2l2.4 2.4 4.8-5" ${CUT} stroke-width="2.2"/>`],
  calendar: [`<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`,
             `<rect x="3.5" y="5" width="17" height="15.5" rx="4" fill="currentColor"/><path d="M3.5 10h17" ${CUT}/><path d="M8 3v4M16 3v4"/>`],
  wallet: [`<rect x="3" y="6" width="18" height="14" rx="4"/><path d="M6 6l9-2.5L16.5 6"/><circle cx="16.5" cy="13" r="1.3" fill="currentColor"/>`,
           `<rect x="3" y="6" width="18" height="14" rx="4" fill="currentColor"/><path d="M6 6l9-2.5L16.5 6"/><circle cx="16.5" cy="13" r="1.5" fill="var(--bg)" stroke="none"/>`],
  cart: [`<path d="M3 5h2.5l2 10h11l2-7.5H6.5"/><circle cx="9" cy="19" r="1.4" fill="currentColor"/><circle cx="17" cy="19" r="1.4" fill="currentColor"/>`,
         `<path d="M3 5h2.5l2 10h11l2-7.5H6.5"/><path d="M7 8h13l-1.8 6.5H8.4z" fill="currentColor"/><circle cx="9" cy="19" r="1.6" fill="currentColor"/><circle cx="17" cy="19" r="1.6" fill="currentColor"/>`],
  more: [`<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>`,
         `<circle cx="5" cy="12" r="2.3" fill="currentColor"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/><circle cx="19" cy="12" r="2.3" fill="currentColor"/>`],
};

export function icon(name, size = 22, filled = false) {
  const body = MAIN[name] ? MAIN[name][filled ? 1 : 0] : (P[name] || '<circle cx="12" cy="12" r="4"/>');
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

// h("div.card", {onclick}, child, "text", …) - a tiny element builder.
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(9)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const iconEl = (name, size) => h("span", { html: icon(name, size), style: { display: "inline-grid" } });

// A rounded square with an icon in a soft colour.
export function tile(name, colorVar = "--accent") {
  return h("span.tile", { html: icon(name, 19), style: { background: `color-mix(in srgb, var(${colorVar}) 20%, transparent)`, color: `var(${colorVar})` } });
}

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The round tick: ticking it pops (a short bounce with the check), then the list moves on.
export function tickBox(on, onToggle) {
  const b = h("button.tick" + (on ? ".on" : ""), { "aria-label": on ? "Done" : "Mark done", html: on ? icon("tick", 15) : "" });
  let busy = false;
  b.addEventListener("click", e => {
    e.stopPropagation();
    if (busy) return;
    if (on || calm()) { onToggle(); return; }
    busy = true;
    b.classList.add("on", "pop");
    b.innerHTML = icon("tick", 15);
    b.closest(".row")?.classList.add("ticked");
    setTimeout(onToggle, 260);
  });
  return b;
}

// A short burst of confetti - for "everything done for today".
export function confetti() {
  if (calm()) return;
  const colors = ["var(--accent)", "var(--today)", "var(--home)", "var(--notes)", "var(--blue)", "var(--warn)"];
  const box = h("div.confetti");
  for (let i = 0; i < 42; i++) {
    const piece = h("i");
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = Math.random() * 0.25 + "s";
    piece.style.animationDuration = 1.1 + Math.random() * 0.8 + "s";
    piece.style.setProperty("--dx", (Math.random() * 120 - 60) + "px");
    piece.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    if (i % 3 === 0) piece.style.borderRadius = "50%";
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2400);
}

export function switchEl(on, onChange) {
  const b = h("button.switch" + (on ? ".on" : ""), { role: "switch", "aria-checked": String(!!on) });
  b.addEventListener("click", e => { e.stopPropagation(); b.classList.toggle("on"); onChange(b.classList.contains("on")); });
  return b;
}

// Segmented control: seg(["Tasks","Calendar"], 0, i => …)
export function seg(labels, active, onPick) {
  return h("div.seg", labels.map((l, i) => h("button" + (i === active ? ".on" : ""), { onclick: () => onPick(i) }, l)));
}

export function chips(items, activeKey, onPick) {
  return h("div.chips", items.map(([key, label]) => h("button.chip" + (key === activeKey ? ".on" : ""), { onclick: () => onPick(key) }, label)));
}

export function btn(label, opts = {}) {
  const cls = "button.btn" + (opts.kind ? "." + opts.kind : "") + (opts.small ? ".small" : "");
  return h(cls, { onclick: opts.onclick, type: "button" }, opts.icon ? iconEl(opts.icon, 17) : null, label);
}

// --- the layer on top: sheets, dialogs, toasts ---

const layer = () => document.getElementById("layer");
let openCount = 0;
export const isOpen = () => openCount > 0;

// A sheet that slides up from the bottom. Returns {el, close}. onClose runs once when it's gone.
// Popups stay put: dragging the dark background (or a popup with nothing to scroll) never moves the popup or the page
// behind it - only real scrolling inside a popup (a long form, a text box) still works.
function holdStill(dim, box) {
  dim.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  let startY = 0;
  box.addEventListener("touchstart", e => { startY = e.touches[0].clientY; }, { passive: true });
  box.addEventListener("touchmove", e => {
    // the nearest thing that can scroll up/down under the finger
    let el = e.target;
    while (el && el !== box.parentNode) {
      if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) break;
      el = el.parentNode;
    }
    if (!el || el === box.parentNode) { e.preventDefault(); return; }   // nothing to scroll: hold still
    const dy = e.touches[0].clientY - startY;
    // at the top pulling down, or at the bottom pushing up: hold still instead of bouncing
    if ((dy > 0 && el.scrollTop <= 0) || (dy < 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 1)) e.preventDefault();
  }, { passive: false });
}

// A popup from the bottom, like on the iPhone: a tall one opens at half height - drag it up (or start scrolling,
// or tap a field) for full height, drag it down to close. A short one opens fully. Only real scrolling inside a full
// popup scrolls; pulling it down at the top moves the popup instead of bouncing.
export function sheet(title, content, { actions = [], onClose } = {}) {
  const dim = h("div.dim");
  const head = h("div.sheethead", h("div.grip"), title ? h("h3.serif", title) : null);
  const box = h("div.sheet", head, content,
    actions.length ? h("div.actions", actions) : null);
  layer().append(dim, box);
  holdStill(dim, box);
  openCount++;
  const vh = window.innerHeight;
  const fullH = box.offsetHeight;
  const halfY = fullH > vh * 0.62 ? Math.round(fullH - vh * 0.55) : 0;   // how far down the half position is
  let y = halfY;                                                          // where it rests now (0 = full)
  const place = (to, animate = true) => {
    box.classList.toggle("dragging", !animate);
    box.style.transform = "translateY(" + Math.max(0, to) + "px)";
  };
  box.style.transform = "translateY(" + (fullH + 40) + "px)";
  void box.offsetHeight;   // start below the screen, then glide up (no waiting for a frame)
  dim.classList.add("in"); box.classList.add("in"); place(y);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount--;
    // a closing popup takes no more taps (a quick double tap on "Add" would book twice)
    box.style.pointerEvents = dim.style.pointerEvents = "none";
    dim.classList.remove("in");
    box.classList.remove("dragging");
    box.style.transform = "translateY(" + (box.offsetHeight + 40) + "px)";
    setTimeout(() => { dim.remove(); box.remove(); }, 300);
    onClose && onClose();
  };
  dim.addEventListener("click", close);
  // where it goes after a drag: full, half (if it has one) or closed
  const settle = (at, velocity) => {
    if (velocity > 0.9 || at > (halfY || 0) + Math.min(160, box.offsetHeight * 0.3)) return close();
    y = halfY && at > halfY / 2 && velocity > -0.6 ? halfY : 0;
    place(y);
  };
  let startY = null, startT = 0, base = 0, dragging = false;
  const begin = e => { startY = e.touches[0].clientY; startT = Date.now(); base = y; dragging = false; };
  // the top bar always drags the popup
  head.addEventListener("touchstart", e => { begin(e); dragging = true; }, { passive: true });
  // the content drags it while it's at half height, or when pulled down at the top of a full popup
  box.addEventListener("touchstart", e => { if (!head.contains(e.target)) begin(e); }, { passive: true });
  box.addEventListener("touchmove", e => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (!dragging) {
      if (Math.abs(dy) < 6) return;
      // a text box (or list) inside that can still scroll up gets the swipe, not the popup
      let inner = e.target;
      while (inner && inner !== box && !(inner.scrollTop > 0 && inner.scrollHeight > inner.clientHeight)) inner = inner.parentNode;
      const innerCanScrollUp = inner && inner !== box;
      dragging = (y > 0 && !innerCanScrollUp) || (dy > 0 && box.scrollTop <= 0 && !innerCanScrollUp);
      if (!dragging) { startY = null; return; }   // a normal scroll inside the full popup
    }
    e.preventDefault();
    place(base + dy, false);
  }, { passive: false });
  box.addEventListener("touchend", e => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    const v = dy / Math.max(1, Date.now() - startT);
    startY = null;
    if (dragging) settle(base + dy, v);
  }, { passive: true });
  // typing needs room: a field gets the full height
  box.addEventListener("focusin", e => { if (y > 0 && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { y = 0; place(0); } });
  return { el: box, close };
}

// A small dialog in the middle. Resolves with the pressed button's value (or null for cancel).
export function dialog(title, body, buttons) {
  return new Promise(resolve => {
    const dim = h("div.dim");
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      openCount--;
      box.style.pointerEvents = dim.style.pointerEvents = "none";
      dim.classList.remove("in"); box.classList.remove("in");
      setTimeout(() => { dim.remove(); box.remove(); }, 180);
      resolve(v);
    };
    const row = h("div.actions", buttons.map(b => btn(b.label, { kind: b.kind || (b.main ? "primary" : "ghost"), onclick: () => finish(b.value) })));
    const box = h("div.dialog", h("h3.serif", title), typeof body === "string" ? h("div.muted", body) : body, row);
    dim.addEventListener("click", () => finish(null));
    layer().append(dim, box);
    holdStill(dim, box);
    openCount++;
    requestAnimationFrame(() => { dim.classList.add("in"); box.classList.add("in"); });
    const first = box.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 60);
    box.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") finish(buttons.find(b => b.main)?.value ?? null); if (e.key === "Escape") finish(null); });
  });
}

export async function confirm(title, text, yes = "OK", danger = false) {
  return (await dialog(title, text, [{ label: "Cancel", value: false }, { label: yes, value: true, main: true, kind: danger ? "danger" : "primary" }])) === true;
}

export async function ask(title, text, initial = "", type = "text") {
  const input = h("input.field", { type, value: initial, style: { marginTop: "10px" } });
  const body = h("div", text ? h("div.muted", text) : null, input);
  const ok = await dialog(title, body, [{ label: "Cancel", value: false }, { label: "OK", value: true, main: true }]);
  return ok ? input.value.trim() : null;
}

let toastTimer = null;
export function toast(text, actionLabel, action) {
  layer().querySelectorAll(".toast").forEach(t => t.remove());
  const t = h("div.toast", h("span", text));
  if (actionLabel && action) {
    let used = false;
    t.append(h("b", { onclick: () => { if (!used) { used = true; action(); t.remove(); } } }, actionLabel));
  }
  layer().append(t);
  requestAnimationFrame(() => t.classList.add("in"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 220); }, action ? 6000 : 3000);
}

export function empty(text) {
  return h("div.empty", text);
}

export function section(title, right) {
  return h("div.section", h("span.caps", title), right ? h("span.small.muted", right) : null);
}
