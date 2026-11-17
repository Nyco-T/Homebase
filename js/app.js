// Homebase Mobile - the start: opens the data, draws the tab bar and the current page, runs the automation,
// and watches for a new version of the app.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { h, icon, toast, isOpen } from "./ui.js";
import { addMissingRepeats } from "./kinds.js";
import { register as registerRules, setDatesSource } from "./rules.js";
import * as auto from "./auto.js";
import * as reminders from "./reminders.js";
import { editRecord } from "./form.js";
import * as home from "./pages/home.js";
import * as plan from "./pages/plan.js";
import * as money from "./pages/money.js";
import * as food from "./pages/food.js";
import * as more from "./pages/more.js";

export const VERSION = "1.0.8";

const TABS = [["home", "Home", "home"], ["plan", "Plan", "calendar"], ["money", "Money", "wallet"], ["food", "Food", "cart"], ["more", "More", "more"]];
const PAGES = { home, plan, money, food, more };
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
  const rec = item.id && db.byId(item.kind, item.id);
  if (rec) editRecord(item.kind, rec);
  else go({ events: "plan/calendar", tasks: "plan/tasks", chores: "plan/chores", repeats: "money/repeats", meals: "food/meals" }[item.kind] || "home");
}

let scrollMemory = {};
export function render() {
  const { tab, sub } = route();
  const page = document.getElementById("page");
  const key = location.hash;
  page.innerHTML = "";
  PAGES[tab].render(page, sub);
  window.scrollTo(0, scrollMemory[key] || 0);
  drawTabs(tab);
}

function drawTabs(active) {
  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  const counts = badgeCounts();
  for (const [id, label, ic] of TABS) {
    const b = h("button" + (id === active ? ".on" : ""), { onclick: () => go(id === route().tab ? id : id) }, h("span", { html: icon(ic, 24) }), label);
    if (counts[id]) b.append(h("span.badge", counts[id] > 99 ? "99+" : String(counts[id])));
    nav.append(b);
  }
}

function badgeCounts() {
  const c = { plan: 0, food: 0, more: auto.suggestions().length };
  for (const x of reminders.active()) {
    if (["tasks", "events", "chores"].includes(x.kind)) c.plan++;
    if (x.kind === "backup") c.more++;
  }
  c.food = db.all("shopping").filter(s => !s.done).length;
  return c;
}

// Redraw after data changes - but not under your fingers while you type in a field on the page.
let redrawTimer = null;
function changed(what) {
  if (!["automarks", "autolog", "dismissed"].includes(what)) scheduleAuto();
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
  applyTheme();
  db.persist();
  registerRules();
  setDatesSource(() => reminders.all());
  db.listen(name => { if (name === "settings") applyTheme(); changed(name); });
  window.addEventListener("hashchange", () => { render(); });
  window.addEventListener("scroll", () => { scrollMemory[location.hash] = window.scrollY; }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !isOpen()) { runAuto(); redraw(); notifyToday(); }
  });
  window.addEventListener("pagehide", () => db.flush());
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
