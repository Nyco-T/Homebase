// Home: today at a glance - quick add, automation, today, coming up, money, shopping list, meals.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, tickBox, btn, sheet, toast, empty } from "../ui.js";
import { d, num, isOn, nextEvent, nextChore, finishTask, choreDone, isCorrection } from "../kinds.js";
import { quickAdd, QUICK_HINT } from "../quick.js";
import * as auto from "../auto.js";
import * as reminders from "../reminders.js";
import { forecast } from "../rules.js";
import { go, openItem, state, installUpdate } from "../app.js";

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

  root.append(automationCard(), todayCard(), comingUpCard(), moneyCard(), shoppingCard(), mealsCard());
}

function automationCard() {
  const pending = auto.suggestions();
  const c = card("Automation", "bolt", "--accent", "more/automation");
  if (pending.length) {
    for (const p of pending.slice(0, 3)) {
      c.append(row(tile(auto.AREAS[p.rule.area].icon, auto.AREAS[p.rule.area].color), p.finding.title, p.finding.detail,
        h("div", { style: { display: "flex", gap: "4px" } },
          btn(p.finding.yes, { kind: "soft", small: true, onclick: e => { e.stopPropagation(); auto.accept(p); toast("Done: " + p.finding.title); } }),
          h("button.btn.ghost.small", { html: icon("x", 16), onclick: e => { e.stopPropagation(); auto.decline(p); } }))));
    }
    if (pending.length > 3) c.append(h("div.small.muted", "+" + (pending.length - 3) + " more suggestions"));
    return c;
  }
  const today = F.todayIso();
  const done = db.all("autolog").filter(r => (r.time || "").startsWith(today) && !r.undone);
  if (!done.length) { c.append(h("div.small.muted", "Homebase watches your lists and does the routine work by itself. Nothing to do right now.")); return c; }
  for (const r of done.slice(-3).reverse()) c.append(row(tile(auto.AREAS[r.area]?.icon || "bolt", auto.AREAS[r.area]?.color || "--accent"), r.text, (r.time || "").slice(11, 16)));
  return c;
}

function todayCard() {
  const t = F.today();
  const c = card("Today", "check", "--today", "plan/tasks");
  const tasks = db.all("tasks").filter(x => !isOn(x, "done") && d(x, "due") && d(x, "due") <= t)
    .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const events = db.all("events").filter(e => { const n = nextEvent(e); return n && n.getTime() === t.getTime(); });
  const chores = db.all("chores").filter(x => nextChore(x) <= t);
  for (const e of events) c.append(row(tile(e.category === "Birthday" ? "gift" : "calendar", "--today"), e.title, [e.time, e.place].filter(Boolean).join(" · ") || "today", null, () => openItem({ kind: "events", id: e.id })));
  for (const x of tasks.slice(0, 6)) {
    const due = d(x, "due");
    c.append(row(tickBox(false, () => { finishTask(x); toast("Done: " + x.title, "Undo", () => undoTask(x)); }), x.title, x.list || "",
      h("span.small" + (due < t ? ".red" : ".muted"), F.relative(due)), () => openItem({ kind: "tasks", id: x.id })));
  }
  for (const x of chores) c.append(row(tile("sparkle", "--home"), x.name, (x.area || "") + " · due " + F.relative(nextChore(x)),
    btn("Done", { kind: "soft", small: true, onclick: e => { e.stopPropagation(); choreDone(x); toast(x.name + " done"); } }), () => openItem({ kind: "chores", id: x.id })));
  if (!tasks.length && !events.length && !chores.length) c.append(h("div.small.muted", "Nothing for today. Type “todo call mum fri” above to plan something."));
  return c;
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

function comingUpCard() {
  const t = F.today();
  const items = reminders.between(F.addDays(t, 1), F.addDays(t, 14)).filter(x => x.kind !== "backup");
  const c = card("Coming up", "calendar", "--today", "plan/calendar");
  if (!items.length) { c.append(h("div.small.muted", "Nothing in the next two weeks. Add an event like “termin Zahnarzt 24.11.” or a birthday.")); return c; }
  for (const x of items.slice(0, 6)) c.append(row(tile(x.icon, x.color), x.title, x.detail, h("span.small.muted", F.relative(x.date)), () => openItem(x)));
  if (items.length > 6) c.append(h("div.small.muted", "+" + (items.length - 6) + " more in the calendar"));
  return c;
}

function moneyCard() {
  const t = F.today();
  const month = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd.getFullYear() === t.getFullYear() && dd.getMonth() === t.getMonth() && dd <= t; });
  const real = month.filter(x => !isCorrection(x));
  const income = real.map(x => num(x, "amount")).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const spent = -real.map(x => num(x, "amount")).filter(v => v < 0).reduce((a, b) => a + b, 0);
  const bal = month.reduce((a, x) => a + num(x, "amount"), 0);
  const c = card("Money this month", "wallet", "--money", "money");
  c.append(h("div.stats", { style: { marginBottom: "6px" } },
    h("div", h("div.caps", "Balance"), h("div.v.serif" + (bal < 0 ? ".red" : ""), F.signedMoney(bal))),
    h("div", h("div.caps", "Income"), h("div.v.serif.greenc", F.money(income))),
    h("div", h("div.caps", "Expenses"), h("div.v.serif.red", F.money(spent)))));
  if (db.all("transactions").length) {
    const f = forecast();
    c.append(h("div.small" + (f.end < 0 ? ".red" : ".muted"), "Month end ≈ " + F.signedMoney(f.end)));
  }
  return c;
}

function shoppingCard() {
  const open = db.all("shopping").filter(s => !s.done);
  const c = card("Shopping list", "cart", "--home", "food/shopping");
  if (!open.length) { c.append(h("div.small.muted", db.all("shopping").length ? "All bought." : "Type “buy milk, bread” above to start your list.")); return c; }
  for (const s of open.slice(0, 5)) {
    c.append(row(tickBox(false, () => { s.done = true; db.touch(s); db.save("shopping"); toast("Bought: " + s.item, "Undo", () => { s.done = false; db.touch(s); db.save("shopping"); }); }),
      s.item, [s.qty, s.store].filter(Boolean).join(" · ")));
  }
  if (open.length > 5) c.append(h("div.small.muted", "+" + (open.length - 5) + " more on the list"));
  return c;
}

function mealsCard() {
  const t = F.today();
  const order = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };
  const coming = db.all("meals").filter(m => { const dd = d(m, "date"); return dd && dd >= t && dd <= F.addDays(t, 6); })
    .sort((a, b) => a.date.localeCompare(b.date) || (order[a.slot] ?? 4) - (order[b.slot] ?? 4));
  const c = card("Meals", "grid", "--home", "food/meals");
  if (!coming.length) { c.append(h("div.small.muted", db.all("recipes").length ? "Nothing planned this week yet." : "Save a few recipes, then plan your week.")); return c; }
  for (const m of coming.slice(0, 5)) {
    const dd = d(m, "date");
    const when = dd.getTime() === t.getTime() ? "Today" : dd.getTime() === F.addDays(t, 1).getTime() ? "Tomorrow" : F.dayDate(dd);
    c.append(row(tile("pot", "--home"), m.title, when + (m.slot ? " · " + m.slot : ""), null, () => go("food/meals")));
  }
  return c;
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
