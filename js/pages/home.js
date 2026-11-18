// Home, calm: quick add, a big Today card, one slim automation line (only when there's something), the questions that
// wait for your yes, and four small cards - Money, Shopping, Coming up, Tonight - that open their page.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, tickBox, btn, sheet, toast, empty, confetti, calm } from "../ui.js";
import { d, num, isOn, nextEvent, nextChore, finishTask, choreDone, isNeutral, balanceOn, accountIcon, dueText, byDue } from "../kinds.js";
import { quickAdd, QUICK_HINT } from "../quick.js";
import * as auto from "../auto.js";
import * as reminders from "../reminders.js";
import { forecast } from "../rules.js";
import { go, openItem, state, installUpdate } from "../app.js";
import { waitingBlock } from "./money.js";
import { priceFor } from "../shopmode.js";

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
}

function card(title, ic, color, link, ...body) {
  return h("div.card",
    h("div.cardhead", { onclick: link ? () => go(link) : null },
      h("h2", tile(ic, color), title), link ? h("span.faint", { html: icon("right", 18) }) : null),
    ...body);
}

function row(lead, title, meta, right, onclick, done) {
  return h("div.row", { onclick },
    lead, h("div.grow", h("div.title" + (done ? ".done" : ""), title), meta ? h("div.meta", meta) : null), right);
}

export function render(root) {
  const t = F.today();
  const bell = reminders.active();
  root.append(h("div.head",
    h("div", { style: { flex: "1" } }, h("h1.serif", greeting()), h("div.muted.small", F.weekday(t) + ", " + F.date(t))),
    h("button.btn.ghost", { onclick: openBell, style: { position: "relative" } }, h("span", { html: icon("bell", 24) }),
      bell.length ? h("span.badge", { style: { position: "absolute", top: "2px", right: "4px" } }, String(bell.length)) : null)));

  if (state.updateReady) {
    root.append(h("div.banner", h("span", { html: icon("download", 20) }), h("div.grow", "A new version of Homebase is ready."), btn("Reload", { kind: "primary", small: true, onclick: installUpdate })));
  }

  // quick add
  const input = h("input.field", { placeholder: QUICK_HINT, enterkeyhint: "done" });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    const result = quickAdd(text);
    if (result) { input.value = ""; toast("Added - " + result); } else toast("Didn't get that - try “" + QUICK_HINT.split(" · ")[0] + "”");
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); input.blur(); } });
  root.append(h("div.quick", input, btn("Add", { kind: "primary", icon: "plus", onclick: add })));

  root.append(todayCard());
  const line = automationLine();
  if (line) root.append(line);
  const waiting = waitingBlock();   // "Did your salary arrive?"
  if (waiting) root.append(waiting);
  root.append(h("div.minigrid", moneyMini(), shoppingMini(), comingMini(), tonightMini()));
  shrinkBack(root);
}

// one slim line: the first suggestion with its yes, and how many more
function automationLine() {
  const pending = auto.suggestions();
  if (!pending.length) return null;
  const p = pending[0];
  return h("div.autoline", { onclick: () => go("more/automation") },
    h("span", { html: icon("bolt", 17) }),
    h("div.grow", h("div.title", p.finding.title), pending.length > 1 ? h("div.meta", "+" + (pending.length - 1) + " more suggestions") : null),
    btn(p.finding.yes, { kind: "soft", small: true, onclick: e => { e.stopPropagation(); auto.accept(p); toast("Done: " + p.finding.title); } }));
}

// a small card: what it is, one big value, one line - tap opens the page
function mini(label, value, meta, link, valueClass = "") {
  const c = h("div.card.mini", { "data-link": link }, h("div.small.muted", label), h("div.mval.serif" + valueClass, value), meta ? h("div.small.muted", meta) : null);
  c.addEventListener("click", () => grow(c, link));
  return c;
}

// Like the App Store: the tapped card grows into its page - and coming back to Home it shrinks into its place again.
let grown = null;
const growerAt = r => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
function grow(card, link) {
  if (calm()) return go(link);
  const g = h("div.grower");
  Object.assign(g.style, growerAt(card.getBoundingClientRect()));
  document.body.append(g);
  grown = link;
  void g.offsetHeight;   // start at the card, then grow
  Object.assign(g.style, { left: "0px", top: "0px", width: innerWidth + "px", height: innerHeight + "px", borderRadius: "0px" });
  setTimeout(() => { go(link); g.classList.add("fade"); setTimeout(() => g.remove(), 240); }, 300);
}
function shrinkBack(root) {
  if (!grown || calm() || !(state.prevKey || "").startsWith("#" + grown)) { grown = null; return; }
  const link = grown;
  grown = null;
  setTimeout(() => {   // once Home is on screen
    const card = root.querySelector('.card.mini[data-link="' + link + '"]');
    if (!card) return;
    const g = h("div.grower");
    Object.assign(g.style, { left: "0px", top: "0px", width: innerWidth + "px", height: innerHeight + "px", borderRadius: "0px" });
    document.body.append(g);
    void g.offsetHeight;
    Object.assign(g.style, { ...growerAt(card.getBoundingClientRect()), borderRadius: "18px" });
    setTimeout(() => { g.classList.add("fade"); setTimeout(() => g.remove(), 200); }, 320);
  }, 0);
}

function moneyMini() {
  const t = F.today();
  const bal = balanceOn(t);
  const meta = db.all("transactions").length ? "end ≈ " + F.moneyShort(forecast().end) : "tap to add an entry";
  return mini("Money", F.signedMoney(bal), meta, "money", bal < 0 ? ".red" : "");
}

function shoppingMini() {
  const open = db.all("shopping").filter(s => !s.done);
  const sum = open.reduce((a, s) => a + (priceFor(s) || 0), 0);
  return mini("Shopping", open.length ? F.plural(open.length, "item", "items") : "All bought", open.length ? (sum > 0 ? "≈ " + (sum < 20 ? F.money(sum) : F.moneyShort(sum)) : "tap to start") : "list is empty", "food/shopping");
}

function comingMini() {
  const t = F.today();
  // money (salary, rent …) isn't listed ahead here - it shows in Money on its day
  const items = reminders.between(F.addDays(t, 1), F.addDays(t, 14)).filter(x => !["backup", "transactions", "repeats", "bridge", "vacation-left"].includes(x.kind))
    .sort((a, b) => a.date - b.date || (a.time || "99").localeCompare(b.time || "99"));
  if (!items.length) return mini("Coming up", "Nothing", "in the next 2 weeks", "calendar");
  const x = items[0];
  const c = mini("Coming up", "", F.relative(x.date) + (x.time ? " " + x.time : "") + (items.length > 1 ? " · +" + (items.length - 1) : ""), "calendar");
  c.querySelector(".mval").replaceWith(h("div.mtitle", x.title));
  return c;
}

function tonightMini() {
  const t = F.todayIso();
  const order = { Dinner: 0, Lunch: 1, Snack: 2, Breakfast: 3 };
  const today = db.all("meals").filter(m => m.date === t).sort((a, b) => (order[a.slot] ?? 4) - (order[b.slot] ?? 4));
  if (!today.length) return mini("Tonight", "Nothing", "plan a meal", "food/meals");
  const m = today[0];
  const r = m.recipe ? db.byId("recipes", m.recipe) : null;
  const c = mini(m.slot === "Dinner" || !m.slot ? "Tonight" : m.slot, "", r && r.minutes ? r.minutes + " min" : (m.slot || ""), "food/meals");
  c.querySelector(".mval").replaceWith(h("div.mtitle", m.title));
  return c;
}

function todayCard() {
  const t = F.today();
  const c = h("div.card.todaycard");
  const tasks = db.all("tasks").filter(x => !isOn(x, "done") && d(x, "due") && d(x, "due") <= t)
    .sort(byDue);
  const events = db.all("events").filter(e => { const n = nextEvent(e); return n && n.getTime() === t.getTime(); });
  const chores = db.all("chores").filter(x => nextChore(x) <= t);
  for (const e of events) c.append(row(tile(e.category === "Birthday" ? "gift" : e.source === "iphone" ? "phone" : "calendar", "--today"), e.title, [e.time, e.place].filter(Boolean).join(" · ") || "today", null, () => openItem({ kind: "events", id: e.id })));
  for (const x of tasks.slice(0, 6)) {
    const due = d(x, "due");
    c.append(row(tickBox(false, () => { finishTask(x); cheerIfClear("Done: " + x.title, () => undoTask(x)); }), x.title, x.list || "",
      h("span.small" + (due < t ? ".red" : ".muted"), dueText(x)), () => openItem({ kind: "tasks", id: x.id })));
  }
  for (const x of chores) c.append(row(tile("sparkle", "--home"), x.name, (x.area || "") + " · due " + F.relative(nextChore(x)),
    btn("Done", { kind: "soft", small: true, onclick: e => { e.stopPropagation(); choreDone(x); cheerIfClear(x.name + " done"); } }), () => openItem({ kind: "chores", id: x.id })));
  const left = tasks.length + chores.length;
  c.prepend(h("div.cardhead", { onclick: () => go("plan/tasks") }, h("h2", { style: { fontSize: "18px" } }, "Today"), h("span.small.muted", left ? left + " left" : "")));
  if (!tasks.length && !events.length && !chores.length) c.append(h("div.small.muted", "Nothing for today. Type “todo call mum fri” above to plan something."));
  return c;
}

// Nothing left for today (tasks due today or earlier, chores due)?
export function todayClear() {
  const t = F.today();
  return !db.all("tasks").some(x => !isOn(x, "done") && d(x, "due") && d(x, "due") <= t) && !db.all("chores").some(x => nextChore(x) <= t);
}
// After ticking something off: confetti when it was the last thing for today.
export function cheerIfClear(text, undo) {
  if (todayClear()) { confetti(); toast("All done for today 🎉", undo ? "Undo" : null, undo); } else if (text) toast(text, undo ? "Undo" : null, undo);
}

export function undoTask(x) {
  x.done = false;
  delete x.doneDate;
  if (x.refundBooked) {   // take back the "paid back" entry it booked
    const e = db.byId("transactions", x.refundBooked);
    if (e) db.remove("transactions", e);
    delete x.refundBooked;
  }
  // a repeating task already made its next copy - take that back too
  const list = db.all("tasks");
  const copy = list.findLast?.(r => r !== x && r.title === x.title && !r.done && r.created >= x.updated?.slice(0, 19));
  if (copy && x.repeat && x.repeat !== "Never") list.splice(list.indexOf(copy), 1);
  db.touch(x);
  db.save("tasks");
}

// The bell: what needs you now. Tap to open, × to hide.
function openBell() {
  const box = h("div");
  const draw = () => {
    box.innerHTML = "";
    const items = reminders.active();
    if (!items.length) { box.append(empty("All clear - nothing needs you right now.")); return; }
    for (const x of items) {
      box.append(row(tile(x.icon, x.color), x.title, F.relative(x.date) + (x.detail ? " · " + x.detail : ""),
        h("button.btn.ghost.small", { html: icon("x", 16), onclick: e => { e.stopPropagation(); reminders.dismiss(x); draw(); } }),
        () => { s.close(); openItem(x); }));
    }
  };
  draw();
  const s = sheet("Reminders", box);
}
