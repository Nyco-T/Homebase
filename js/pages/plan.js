// Plan: Tasks · Calendar · Chores.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, tickBox, btn, seg, chips, toast, empty, section } from "../ui.js";
import { d, num, isOn, nextChore, nextEvent, finishTask, choreDone } from "../kinds.js";
import { quickAdd } from "../quick.js";
import { editRecord, newRecord } from "../form.js";
import * as reminders from "../reminders.js";
import { go, openItem } from "../app.js";
import { undoTask } from "./home.js";
import * as phonecal from "../phonecal.js";

const TABS = ["tasks", "calendar", "chores"];
let taskFilter = "open";
let calMonth = null;
let calDay = null;
let calFor = "";   // the day the calendar was opened - a new day jumps back to today

export function render(root, sub) {
  const tab = TABS.includes(sub) ? sub : "tasks";
  root.append(h("div.head", h("h1.serif", "Plan")));
  root.append(seg(["Tasks", "Calendar", "Chores"], TABS.indexOf(tab), i => go("plan/" + TABS[i])));
  if (tab === "tasks") tasks(root);
  else if (tab === "calendar") calendar(root);
  else chores(root);
}

function fab(onclick) {
  return h("button.fab", { onclick, "aria-label": "New", html: icon("plus", 26) });
}

// ---------------- Tasks ----------------

function tasks(root) {
  const input = h("input.field", { placeholder: "call mum fri · pay rent 1.12. #Money · fix bike !", enterkeyhint: "done" });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    quickAdd("todo " + text);
    input.value = "";
    toast("Task added");
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  root.append(h("div.quick", input, btn("", { kind: "primary", icon: "plus", onclick: add })));

  const all = db.all("tasks");
  const t = F.today();
  const open = all.filter(x => !isOn(x, "done"));
  const count = f => all.filter(f).length;
  const filters = {
    open: x => !isOn(x, "done"),
    today: x => !isOn(x, "done") && d(x, "due") && d(x, "due") <= t,
    upcoming: x => !isOn(x, "done") && d(x, "due") && d(x, "due") > t,
    someday: x => !isOn(x, "done") && !x.due,
    done: x => isOn(x, "done"),
  };
  root.append(chips([["open", "Open " + count(filters.open)], ["today", "Today " + count(filters.today)], ["upcoming", "Upcoming " + count(filters.upcoming)],
    ["someday", "Someday " + count(filters.someday)], ["done", "Done"]], taskFilter, k => { taskFilter = k; go("plan/tasks"); }));

  const shown = all.filter(filters[taskFilter]);
  if (!shown.length) {
    root.append(empty(all.length ? "Nothing here." : "No tasks yet. Type one above - a day at the end (fri, +3, 24.11.) sets the due date, ! makes it important."));
  } else if (taskFilter === "done") {
    const done = shown.sort((a, b) => (b.doneDate || "").localeCompare(a.doneDate || "")).slice(0, 30);
    root.append(list(done.map(taskRow)));
  } else {
    const groups = [["Overdue", x => d(x, "due") && d(x, "due") < t], ["Today", x => d(x, "due") && d(x, "due").getTime() === t.getTime()],
      ["Tomorrow", x => d(x, "due") && d(x, "due").getTime() === F.addDays(t, 1).getTime()],
      ["This week", x => d(x, "due") && d(x, "due") > F.addDays(t, 1) && d(x, "due") <= F.addDays(t, 7)],
      ["Later", x => d(x, "due") && d(x, "due") > F.addDays(t, 7)], ["Someday", x => !x.due]];
    const prio = x => x.priority === "High" ? 0 : x.priority === "Low" ? 2 : 1;
    for (const [name, test] of groups) {
      const items = shown.filter(test).sort((a, b) => (a.due || "").localeCompare(b.due || "") || prio(a) - prio(b));
      if (!items.length) continue;
      root.append(section(name + " · " + items.length));
      root.append(list(items.map(taskRow)));
    }
  }
  if (!open.length && taskFilter !== "done" && all.length) root.append(h("div.empty", "All done 🎉"));
  root.append(fab(() => newRecord("tasks")));
}

const list = rows => h("div.list", rows);

function taskRow(x) {
  const t = F.today();
  const due = d(x, "due");
  const done = isOn(x, "done");
  const steps = x.steps || [];
  const meta = [x.list, x.repeat && x.repeat !== "Never" ? "repeats " + x.repeat.toLowerCase() : "", steps.length ? steps.filter(s => s.done).length + "/" + steps.length + " steps" : ""].filter(Boolean).join(" · ");
  return h("div.row", { onclick: () => editRecord("tasks", x, { actions: done ? [] : [{ label: "Mark done", icon: "tick", run: r => { finishTask(r); toast("Done: " + r.title, "Undo", () => undoTask(r)); } }] }) },
    tickBox(done, () => {
      if (done) { undoTask(x); return; }
      finishTask(x);
      toast("Done: " + x.title, "Undo", () => undoTask(x));
    }),
    h("div.grow", h("div.title" + (done ? ".done" : ""), (x.priority === "High" && !done ? "! " : "") + x.title), meta ? h("div.meta", meta) : null),
    due && !done ? h("span.small" + (due < t ? ".red" : ".muted"), F.relative(due)) : null);
}

// ---------------- Calendar ----------------

function calendar(root) {
  const t = F.today();
  if (calFor !== F.todayIso()) { calFor = F.todayIso(); calMonth = null; calDay = null; }
  calMonth = calMonth || new Date(t.getFullYear(), t.getMonth(), 1);
  calDay = calDay || t;
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  root.append(h("div.head", { style: { margin: "0 0 10px" } },
    h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { calMonth = new Date(y, m - 1, 1); go("plan/calendar"); } }),
    h("div.serif", { style: { flex: "1", textAlign: "center", fontSize: "20px" } }, F.monthName(y, m)),
    h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { calMonth = new Date(y, m + 1, 1); go("plan/calendar"); } }),
    btn("Today", { small: true, onclick: () => { calMonth = new Date(t.getFullYear(), t.getMonth(), 1); calDay = t; go("plan/calendar"); } })));

  const start = F.mondayOf(new Date(y, m, 1));
  const end = F.addDays(start, 41);
  const items = reminders.between(start, end).filter(x => !["backup", "phonecal", "confirm"].includes(x.kind));
  const byDay = {};
  for (const x of items) (byDay[F.iso(x.date)] = byDay[F.iso(x.date)] || []).push(x);
  // repeating events: every repeat in this month view, not only the next one
  for (const e of db.all("events")) {
    if (!e.repeat || e.repeat === "Never" || !d(e, "date")) continue;
    let x = d(e, "date");
    const shownNext = nextEvent(e)?.getTime();
    for (let i = 0; x <= end && i < 600; i++) {
      if (x >= start && x.getTime() !== shownNext) (byDay[F.iso(x)] = byDay[F.iso(x)] || []).push({ date: x, title: e.title, detail: e.time || "", kind: "events", id: e.id, icon: e.category === "Birthday" ? "gift" : "calendar", color: "--today" });
      x = e.repeat === "Weekly" ? F.addDays(x, 7) : e.repeat === "Monthly" ? F.addMonths(x, 1) : F.addMonths(x, 12);
    }
  }

  const grid = h("div.cal", ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(n => h("div.dow", n)));
  for (let i = 0; i < 42; i++) {
    const day = F.addDays(start, i);
    const key = F.iso(day);
    const dots = (byDay[key] || []).slice(0, 4).map(x => h("i", { style: { background: `var(${x.color})` } }));
    const cls = "div.day" + (day.getMonth() !== m ? ".other" : "") + (day.getTime() === t.getTime() ? ".today" : "") + (day.getTime() === calDay.getTime() ? ".sel" : "");
    grid.append(h(cls, { onclick: () => { calDay = day; go("plan/calendar"); } }, h("span", day.getDate()), h("div.dots", dots)));
  }
  root.append(grid);

  const dayItems = byDay[F.iso(calDay)] || [];
  root.append(section(F.weekday(calDay) + ", " + F.date(calDay), F.relative(calDay)));
  if (!dayItems.length) root.append(h("div.list", h("div.row", h("div.grow.muted", "Nothing on this day."))));
  else root.append(list(dayItems.map(x => h("div.row", { onclick: () => openItem(x) }, tile(x.icon, x.color), h("div.grow", h("div.title", x.title), x.detail ? h("div.meta", x.detail) : null)))));
  root.append(h("div.btnrow", { style: { marginTop: "4px" } },
    btn("Event", { icon: "plus", onclick: () => newRecord("events", { date: F.iso(calDay) }) }),
    btn("Birthday", { icon: "gift", onclick: () => newRecord("events", { date: F.iso(calDay), repeat: "Yearly", category: "Birthday", title: "" }) }),
    btn("Task", { icon: "check", onclick: () => newRecord("tasks", { due: F.iso(calDay) }) })));

  // the iPhone's own calendar, read through a Shortcut
  const last = phonecal.lastRead();
  const count = db.all("events").filter(phonecal.isPhone).length;
  root.append(section("iPhone calendar", last ? "read " + F.relative(F.parseIso(last)) + " " + last.slice(11, 16) : ""));
  root.append(h("div.list", h("div.row", tile("phone", "--today"),
    h("div.grow", h("div.title", last ? F.plural(count, "event", "events") + " from your iPhone" : "Show your iPhone calendar here"),
      h("div.meta", { style: { whiteSpace: "normal" } }, last ? "Run the shortcut “Homebase Kalender”, then Update." : "Set up a small shortcut once - then your iPhone events show up in Homebase.")),
    last ? h("div", { style: { display: "flex", gap: "4px" } },
      h("button.btn.ghost.small", { html: icon("gear", 18), onclick: phonecal.setupSheet, "aria-label": "How to set it up" }),
      btn("Update", { kind: "soft", small: true, onclick: phonecal.update }))
      : btn("Set up", { kind: "soft", small: true, onclick: phonecal.setupSheet }))));
}

// ---------------- Chores ----------------

function chores(root) {
  const t = F.today();
  const all = db.all("chores").slice().sort((a, b) => nextChore(a) - nextChore(b));
  if (!all.length) {
    root.append(empty("Jobs that come back: clean the bathroom every 7 days, water the plants every 3. Tap + to add one - Homebase tells you when it's due again."));
  } else {
    const due = all.filter(x => nextChore(x) <= t);
    const later = all.filter(x => nextChore(x) > t);
    if (due.length) { root.append(section("Due · " + due.length)); root.append(list(due.map(choreRow))); }
    if (later.length) { root.append(section("Coming")); root.append(list(later.map(choreRow))); }
  }
  root.append(fab(() => newRecord("chores")));
}

function choreRow(x) {
  const next = nextChore(x);
  const due = next <= F.today();
  return h("div.row", { onclick: () => editRecord("chores", x, { actions: [{ label: "Done today", icon: "tick", run: r => { choreDone(r); toast(r.name + " done"); } }] }) },
    tile("sparkle", "--home"),
    h("div.grow", h("div.title", x.name), h("div.meta", [x.area, "every " + (num(x, "every") || 7) + " days", x.lastDone ? "last " + F.relative(d(x, "lastDone")) : ""].filter(Boolean).join(" · "))),
    due ? btn("Done", { kind: "soft", small: true, onclick: e => { e.stopPropagation(); choreDone(x); toast(x.name + " done - next " + F.relative(nextChore(x))); } })
      : h("span.small.muted", F.relative(next)));
}
