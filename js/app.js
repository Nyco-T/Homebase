// Homebase Mobile - the start: opens the data, draws the tab bar and the current page, runs the automation,
// and watches for a new version of the app.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { h, icon, toast, isOpen } from "./ui.js";
import { addMissingRepeats, waitingRepeats } from "./kinds.js";
import { register as registerRules, setDatesSource } from "./rules.js";
import * as auto from "./auto.js";
import * as reminders from "./reminders.js";
import { editRecord } from "./form.js";
import * as phonecal from "./phonecal.js";
import * as lock from "./lock.js";
import * as push from "./push.js";
import * as home from "./pages/home.js";
import * as plan from "./pages/plan.js";
import * as calendarPage from "./pages/calendar.js";
import * as money from "./pages/money.js";
import * as food from "./pages/food.js";
import * as more from "./pages/more.js";

export const VERSION = "1.12.8";

const TABS = [["home", "Home", "home"], ["plan", "Plan", "check"], ["calendar", "Calendar", "calendar"], ["money", "Money", "wallet"], ["food", "Food", "cart"], ["more", "More", "more"]];
const PAGES = { home, plan, calendar: calendarPage, money, food, more };
export const state = { updateReady: null };

export function go(hash) {
  if (location.hash === "#" + hash) render(); else location.hash = hash;
}

export function route() {
  const [tab, sub] = (location.hash.slice(1) || "home").split("/");
  return { tab: PAGES[tab] ? tab : "home", sub };
}

// Opens a record wherever it lives (from Home, the calendar, the bell).
export function openItem(item) {
  if (!item) return;
  if (item.kind === "backup") return go("more/settings");
  if (item.kind === "transactions" && !item.id) return go("money");
  if (item.kind === "phonecal") return phonecal.update();
  if (item.kind === "countcash") return money.askBalance("Cash");
  if (item.kind === "timeoff") { const r = db.byId("timeoff", item.id); return r ? plan.timeoffSheet(r) : go("plan/timeoff"); }
  if (["holiday", "bridge", "vacation-left"].includes(item.kind)) return go("plan/timeoff");
  if (item.kind === "confirm") { const w = waitingRepeats().find(x => x.rule.id === item.id); return w ? money.askRepeat(w) : go("money"); }   // from a tap, so the clipboard may be read
  const rec = item.id && db.byId(item.kind, item.id);
  if (rec && phonecal.isPhone(rec)) phonecal.show(rec);
  else if (rec) editRecord(item.kind, rec);
  else go({ events: "calendar", tasks: "plan/tasks", chores: "plan/chores", repeats: "money/repeats", meals: "food/meals" }[item.kind] || "home");
}

let scrollMemory = {};
let shownKey = null;
let enterTimer = null;
export function render() {
  const { tab, sub } = route();
  const page = document.getElementById("page");
  const key = location.hash;
  state.prevKey = shownKey;   // where you came from (Home uses it to shrink a card back into place)
  page.innerHTML = "";
  PAGES[tab].render(page, sub);
  // a new page slides in softly - a redraw after a change on the same page doesn't
  if (shownKey !== null && key !== shownKey) {
    page.classList.remove("enter"); void page.offsetWidth; page.classList.add("enter");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => page.classList.remove("enter"), 600);   // so a later redraw doesn't slide in again
  } else if (key === shownKey) page.classList.remove("enter");
  shownKey = key;
  window.scrollTo(0, scrollMemory[key] || 0);
  updateTopbar();
  depth();
  drawTabs(tab);
}

// The big page title shrinks away when you scroll and comes back small in a glass bar at the top.
let topbar = null;
function updateTopbar() {
  if (!topbar) { topbar = document.createElement("div"); topbar.id = "topbar"; document.body.append(topbar); }
  const h1 = document.querySelector("#page .head h1");
  const y = window.scrollY;
  if (h1) {
    const f = Math.min(1, Math.max(0, y / 44));
    h1.style.opacity = String(1 - f);
    h1.style.transform = f ? "scale(" + (1 - f * 0.08) + ")" : "";
    topbar.textContent = h1.textContent;
  }
  topbar.classList.toggle("show", !!h1 && y > 38);
}

// Depth: what scrolls away under the glass top bar fades and shrinks a little as its bottom reaches the bar.
let depthFrame = 0;
function depth() {
  cancelAnimationFrame(depthFrame);
  depthFrame = requestAnimationFrame(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bar = document.getElementById("topbar");
    const edge = bar && bar.classList.contains("show") ? bar.offsetHeight : 0;
    for (const el of document.getElementById("page").children) {
      if (el.classList.contains("fab") || el.classList.contains("head")) continue;
      const r = el.getBoundingClientRect();
      const f = edge ? Math.max(0, Math.min(1, (edge + 70 - r.bottom) / 110)) : 0;
      el.style.opacity = f ? String(1 - f * 0.65) : "";
      el.style.transform = f ? "scale(" + (1 - f * 0.05) + ")" : "";
      el.style.transformOrigin = f ? "center bottom" : "";
    }
  });
}

function drawTabs(active) {
  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  const counts = badgeCounts();
  for (const [id, label, ic] of TABS) {
    const b = h("button" + (id === active ? ".on" : ""), { onclick: () => go(id === route().tab ? id : id) }, h("span", { html: icon(ic, 24, id === active) }), label);
    if (counts[id]) b.append(h("span.badge", counts[id] > 99 ? "99+" : String(counts[id])));
    nav.append(b);
  }
}

function badgeCounts() {
  const c = { plan: 0, calendar: 0, food: 0, more: auto.suggestions().length };
  for (const x of reminders.active()) {
    if (["tasks", "chores"].includes(x.kind)) c.plan++;
    if (x.kind === "events") c.calendar++;
    if (x.kind === "backup") c.more++;
  }
  c.food = db.all("shopping").filter(s => !s.done).length;
  return c;
}

// Redraw after data changes - but not under your fingers while you type in a field on the page.
const USER_DATA = new Set(["events", "tasks", "notes", "transactions", "repeats", "shopping", "meals", "recipes", "chores", "rules", "timeoff", "import"]);
let redrawTimer = null;
function changed(what) {
  // the automation's own signals don't start it again (that was a loop: run -> "automation" -> run … every 1.5 s)
  // only a change to your own data starts the automation - never its own signals, its logs or settings
  // (that was twice a loop: run -> "automation" -> run, and push -> settings -> run)
  if (USER_DATA.has(what)) scheduleAuto();
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(redraw, 60);
}
function redraw() {
  const a = document.activeElement;
  if (a && document.getElementById("page").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) {
    a.addEventListener("blur", () => setTimeout(redraw, 50), { once: true });
    return;
  }
  scrollMemory[location.hash] = window.scrollY;
  render();
  updateAppBadge();
}

let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(runAuto, 1500);
}
function runAuto() {
  addMissingRepeats();
  const done = auto.run();
  push.schedule().catch(() => {});   // notifications for the next days, through ntfy (if switched on)
  if (done.length) toast("Automation: " + done[0] + (done.length > 1 ? "  (+" + (done.length - 1) + ")" : ""), "Show", () => go("more/automation"));
}

function applyTheme() {
  const t = db.setting("theme", "system");
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}

// --- app icon badge + one notification a day (iOS 16.4+, Homebase on the Home Screen, notifications allowed) ---
function updateAppBadge() {
  const n = reminders.active().filter(x => x.date <= F.today()).length;
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) { /* not supported */ }
}

async function notifyToday() {
  if (!db.setting("notify", false) || !("Notification" in window) || Notification.permission !== "granted") return;
  if (db.setting("lastNotified", "") === F.todayIso()) return;
  const now = reminders.active().filter(x => x.date <= F.today());
  await db.setSetting("lastNotified", F.todayIso());
  if (!now.length) return;
  const body = now.slice(0, 6).map(x => "• " + x.title).join("\n") + (now.length > 6 ? "\n… and " + (now.length - 6) + " more" : "");
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification("Homebase: " + F.plural(now.length, "thing", "things") + " today", { body, icon: "icons/icon-192.png", tag: "today" });
  } catch (e) { /* notifications not possible here */ }
}

// --- updates: a new version is fetched in the background; you decide when to reload ---
function watchUpdates() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const ready = worker => { state.updateReady = worker; redraw(); };
    if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) ready(w); });
    });
    if (navigator.onLine) reg.update().catch(() => {});
    state.checkUpdate = () => reg.update();
  }).catch(e => console.warn("offline mode not available:", e));
  // reload only when a new version takes over - not on the very first start, when the offline copy is just set up
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}

export function installUpdate() {
  if (state.updateReady) state.updateReady.postMessage("take-over");
}

async function start() {
  await db.open();
  lock.watch();   // the Face ID lock screen comes first, before anything shows
  applyTheme();
  db.persist();
  registerRules();
  setDatesSource(() => reminders.all());
  db.listen(name => { if (name === "settings") applyTheme(); changed(name); });
  window.addEventListener("hashchange", () => { render(); });
  window.addEventListener("scroll", () => { scrollMemory[location.hash] = window.scrollY; updateTopbar(); depth(); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !isOpen()) { runAuto(); redraw(); notifyToday(); }
  });
  window.addEventListener("pagehide", () => db.flushAll());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") db.flushAll(); });
  let warned = 0;
  db.whenSaveFails(e => { if (Date.now() - warned > 60000) { warned = Date.now(); toast("Couldn't save - is your phone's storage full? (" + ((e && e.name) || "error") + ")"); } });
  render();
  runAuto();
  updateAppBadge();
  notifyToday();
  watchUpdates();
  setInterval(() => { if (document.visibilityState === "visible") runAuto(); }, 5 * 60 * 1000);
}

start().catch(e => {
  document.getElementById("page").innerHTML = "<div class='empty'>Homebase couldn't start: " + F.esc(e.message) + "</div>";
  console.error(e);
});
