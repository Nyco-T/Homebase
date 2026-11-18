// Plan: Tasks · Chores · Time off. (The calendar has its own tab - its view lives here and pages/calendar.js shows it.)

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, tickBox, btn, seg, chips, toast, empty, section, sheet, dialog } from "../ui.js";
import * as TO from "../timeoff.js";
import * as ICS from "../ics.js";
import { switchEl } from "../ui.js";
import { d, num, isOn, nextChore, nextEvent, finishTask, choreDone, dueText, byDue } from "../kinds.js";
import { quickAdd } from "../quick.js";
import { editRecord, newRecord } from "../form.js";
import * as reminders from "../reminders.js";
import { go, openItem } from "../app.js";
import { undoTask, todayClear, cheerIfClear } from "./home.js";
import * as phonecal from "../phonecal.js";

const TABS = ["tasks", "chores", "timeoff"];
let taskFilter = "open";
let calMonth = null;
let calDay = null;
let calFor = "";   // the day the calendar was opened - a new day jumps back to today

export function render(root, sub) {
  if (sub === "calendar") { go("calendar"); return; }   // old links
  const tab = TABS.includes(sub) ? sub : "tasks";
  root.append(h("div.head", h("h1.serif", "Plan")));
  root.append(seg(["Tasks", "Chores", "Time off"], TABS.indexOf(tab), i => go("plan/" + TABS[i])));
  if (tab === "tasks") tasks(root);
  else if (tab === "timeoff") timeoff(root);
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
      const items = shown.filter(test).sort((a, b) => byDue(a, b) || prio(a) - prio(b));
      if (!items.length) continue;
      const sec = section(name + " · " + items.length);
      if (name === "Today") sec.classList.add("today");
      root.append(sec);
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
      const wasToday = d(x, "due") && d(x, "due") <= F.today();
      finishTask(x);
      if (wasToday) cheerIfClear("Done: " + x.title, () => undoTask(x)); else toast("Done: " + x.title, "Undo", () => undoTask(x));
    }),
    h("div.grow", h("div.title" + (done ? ".done" : ""), (x.priority === "High" && !done ? "! " : "") + x.title), meta ? h("div.meta", meta) : null),
    due && !done ? h("span.small" + (due < t ? ".red" : ".muted"), dueText(x)) : null);
}

// ---------------- Calendar ----------------

export function calendar(root) {
  const t = F.today();
  if (calFor !== F.todayIso()) { calFor = F.todayIso(); calMonth = null; calDay = null; }
  calMonth = calMonth || new Date(t.getFullYear(), t.getMonth(), 1);
  calDay = calDay || t;
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  root.append(h("div.head", { style: { margin: "0 0 10px" } },
    h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { calMonth = new Date(y, m - 1, 1); go("calendar"); } }),
    h("div.serif", { style: { flex: "1", textAlign: "center", fontSize: "20px" } }, F.monthName(y, m)),
    h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { calMonth = new Date(y, m + 1, 1); go("calendar"); } }),
    btn("Today", { small: true, onclick: () => { calMonth = new Date(t.getFullYear(), t.getMonth(), 1); calDay = t; go("calendar"); } })));

  const start = F.mondayOf(new Date(y, m, 1));
  const end = F.addDays(start, 41);
  const items = reminders.between(start, end).filter(x => !["backup", "phonecal", "confirm", "countcash", "timeoff", "vacation-left"].includes(x.kind));
  const byDay = {};
  for (const x of items) (byDay[F.iso(x.date)] = byDay[F.iso(x.date)] || []).push(x);
  // repeating events: every repeat in this month view, not only the next one
  // every day of a break, and the public holidays of your state
  const add = (day, item) => (byDay[F.iso(day)] = byDay[F.iso(day)] || []).push(item);
  for (const r of db.all("timeoff")) {
    const from = F.parseIso(r.from), to = F.parseIso(r.to) || from;
    if (!from || to < start || from > end) continue;
    for (let x = from, i = 0; x <= to && i < 400; x = F.addDays(x, 1), i++) {
      if (x >= start && x <= end) add(x, { date: x, title: (TYPE_EMOJI[r.type || "Vacation"] || "🏖️") + " " + (r.title || r.type || "Time off"), detail: TO.isWorkDay(x) ? (r.type || "Vacation") : "free anyway", kind: "timeoff", id: r.id, icon: "calendar", color: "--blue" });
    }
  }
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    for (const hd of TO.holidays(y)) if (hd.date >= start && hd.date <= end) add(hd.date, { date: hd.date, title: "🎉 " + hd.name, detail: "public holiday", kind: "holiday", id: null, icon: "sparkle", color: "--warn" });
  }
  for (const e of db.all("events")) {
    if (!e.repeat || e.repeat === "Never" || !d(e, "date")) continue;
    let x = d(e, "date");
    const shownNext = nextEvent(e)?.getTime();
    for (let i = 0; x <= end && i < 600; i++) {
      if (x >= start && x.getTime() !== shownNext) (byDay[F.iso(x)] = byDay[F.iso(x)] || []).push({ date: x, title: e.title, detail: e.time || "", time: (e.time || "").slice(0, 5), kind: "events", id: e.id, icon: e.category === "Birthday" ? "gift" : "calendar", color: "--today" });
      x = e.repeat === "Weekly" ? F.addDays(x, 7) : e.repeat === "Monthly" ? F.addMonths(x, 1) : F.addMonths(x, 12);
    }
  }

  const grid = h("div.cal", ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(n => h("div.dow", n)));
  for (let i = 0; i < 42; i++) {
    const day = F.addDays(start, i);
    const key = F.iso(day);
    const dots = (byDay[key] || []).slice(0, 4).map(x => h("i", { style: { background: `var(${x.color})` } }));
    const cls = "div.day" + (day.getMonth() !== m ? ".other" : "") + (day.getTime() === t.getTime() ? ".today" : "") + (day.getTime() === calDay.getTime() ? ".sel" : "");
    grid.append(h(cls, { onclick: () => { calDay = day; go("calendar"); } }, h("span", day.getDate()), h("div.dots", dots)));
  }
  root.append(grid);

  // the day: everything by time (appointments and tasks mixed), all-day things at the end; tasks tick off right here
  const dayItems = (byDay[F.iso(calDay)] || []).slice().sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const daySec = section(F.weekday(calDay) + ", " + F.date(calDay), F.relative(calDay));
  if (calDay.getTime() === t.getTime()) daySec.classList.add("today");
  root.append(daySec);
  if (!dayItems.length) root.append(h("div.list", h("div.row", h("div.grow.muted", "Nothing on this day."))));
  else root.append(list(dayItems.map(x => {
    const task = x.kind === "tasks" ? db.byId("tasks", x.id) : null;
    const lead = task ? tickBox(false, () => { finishTask(task); cheerIfClear("Done: " + task.title, () => undoTask(task)); }) : tile(x.icon, x.color);
    return h("div.row", { onclick: () => openItem(x) }, h("span.daytime" + (x.time ? "" : ".muted"), x.time || "all day"), lead,
      h("div.grow", h("div.title", x.title), x.detail ? h("div.meta", x.detail) : null));
  })));
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
      : btn("Set up", { kind: "soft", small: true, onclick: phonecal.setupSheet })),
    h("div.row", tile("calendar", "--blue"),
      h("div.grow", h("div.title", "Send to iPhone Calendar"), h("div.meta", { style: { whiteSpace: "normal" } },
        db.setting("ics.last", "") ? "last sent " + F.relative(F.parseIso(db.setting("ics.last", ""))) : "Your appointments and time off in the iPhone's Calendar app")),
      btn("Send", { kind: "soft", small: true, onclick: sendSheet }))));
}

// What to send (remembered), only new or everything - then the share sheet with the calendar file.
function sendSheet() {
  const opts = { events: true, timeoff: true, tasks: false, holidays: false, ...(db.setting("ics.opts", {}) || {}) };
  let mode = db.setting("ics.last", "") ? "new" : "all";
  const listBox = h("div.list");
  const modeBox = h("div", { style: { display: "flex", gap: "6px", marginTop: "12px" } });
  const sendBtn = btn("Send", { kind: "primary", icon: "calendar", onclick: async () => {
    const all = ICS.items(opts), list = mode === "new" ? all.filter(ICS.isNew) : all;
    if (!list.length) { toast(all.length ? "Nothing new to send - everything is in your iPhone calendar" : "Nothing to send yet"); return; }
    const ok = await ICS.share(ICS.file(list));
    if (!ok) return;
    ICS.markSent(list);
    s.close();
    toast(F.plural(list.length, "item", "items") + " in the file - open it and tap “Add All”");
  } });
  const draw = () => {
    db.setSetting("ics.opts", opts);
    const all = ICS.items(opts), fresh = all.filter(ICS.isNew).length;
    modeBox.innerHTML = "";
    for (const [k, label] of [["new", "Only new · " + fresh], ["all", "Everything · " + all.length]]) {
      modeBox.append(h("button.chip" + (mode === k ? ".on" : ""), { type: "button", style: { flex: "1" }, onclick: () => { mode = k; draw(); } }, label));
    }
    const n = mode === "new" ? fresh : all.length;
    sendBtn.lastChild.textContent = n ? "Send " + n : "Send";
  };
  const toggle = (key, title, meta) => h("div.row", h("div.grow", h("div.title", title), h("div.meta", meta)), switchEl(opts[key], on => { opts[key] = on; draw(); }));
  listBox.append(
    toggle("events", "📅 Appointments and events", "incl. repeating ones and birthdays"),
    toggle("timeoff", "🏖️ Time off", "your breaks, as all-day events"),
    toggle("tasks", "✅ Tasks with a date", "as all-day entries"),
    toggle("holidays", "🎉 Public holidays", "your iPhone usually has them already"));
  draw();
  const s = sheet("Send to iPhone Calendar", h("div",
    h("div.small.muted", { style: { marginBottom: "10px", whiteSpace: "normal" } }, "Homebase makes a calendar file - your iPhone adds what's in it. Events from your iPhone calendar are never sent back."),
    listBox, modeBox,
    h("div.small.muted", { style: { marginTop: "10px", whiteSpace: "normal" } }, "Then: Save to Files → open the file → Add All. Sending a changed item again updates it in your iPhone calendar.")), {
    actions: [btn("Cancel", { kind: "ghost", onclick: () => s.close() }), sendBtn] });
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
    due ? btn("Done", { kind: "soft", small: true, onclick: e => { e.stopPropagation(); choreDone(x); cheerIfClear(x.name + " done - next " + F.relative(nextChore(x))); } })
      : h("span.small.muted", F.relative(next)));
}

// ---------------- Time off ----------------

const TYPE_EMOJI = { Vacation: "🏖️", "Half day": "🌤️", Sick: "🤒", School: "🏫" };
const TYPE_COLOR = { Vacation: "--blue", "Half day": "--home", Sick: "--red", School: "--notes" };
const typeTile = t => h("span.tile.cat", { style: { background: `color-mix(in srgb, var(${TYPE_COLOR[t] || "--blue"}) 22%, transparent)` } }, TYPE_EMOJI[t] || "🏖️");
const fmtDays = n => (Number.isInteger(n) ? String(n) : String(n).replace(".", ",")) + (n === 1 ? " day" : " days");
const range = r => { const a = F.parseIso(r.from), b = F.parseIso(r.to) || a; return a.getTime() === b.getTime() ? F.dayDate(a) : F.shortDate(a) + " – " + F.date(b); };

function timeoff(root) {
  if (!TO.isSetUp()) { root.append(setupCard()); return; }
  const t = F.today();
  const bal = TO.balances();
  // the years that matter now: this one, last year while its days are still valid, next year once something is planned or from October
  const years = Object.values(bal).filter(b => b.year === t.getFullYear() || (b.year === t.getFullYear() - 1 && b.left > 0 && t <= b.expires)
    || (b.year === t.getFullYear() + 1 && (b.planned > 0 || t.getMonth() >= 9)));
  for (const b of years) root.append(yearCard(b, t));

  // your days off: coming ones first, then the earlier ones
  const all = db.all("timeoff").slice();
  const coming = all.filter(r => (r.to || r.from) >= F.todayIso()).sort((a, b) => a.from.localeCompare(b.from));
  const earlier = all.filter(r => (r.to || r.from) < F.todayIso()).sort((a, b) => b.from.localeCompare(a.from)).slice(0, 12);
  if (!all.length) root.append(empty("No days off yet. Tap + to add your next break - Homebase counts only work days."));
  for (const [name, list] of [["Your days off", coming], ["Earlier", earlier]]) {
    if (!list.length) continue;
    root.append(section(name));
    root.append(h("div.list", list.map(r => {
      const n = TO.countOf(r), wd = TO.workDays(r), ty = r.type || "Vacation";
      const right = ty === "Vacation" || ty === "Half day" ? fmtDays(n) : wd + (wd === 1 ? " day " : " days ") + ty.toLowerCase();
      return h("div.row", { onclick: () => timeoffSheet(r) }, typeTile(ty),
        h("div.grow", h("div.title", r.title || ty), h("div.meta", range(r) + ((r.to || r.from) >= F.todayIso() && r.from > F.todayIso() ? " · planned" : ""))),
        h("span.right", right));
    })));
  }

  // public holidays coming up, and bridge-day tips
  const next = [t.getFullYear(), t.getFullYear() + 1].flatMap(y => TO.holidays(y)).filter(x => x.date >= t).slice(0, 4);
  const tips = TO.bridgeDays(t, F.addDays(t, 365)).slice(0, 3);
  root.append(section("Coming holidays", TO.STATES[TO.state()]));
  root.append(h("div.list", next.map(x => h("div.row", h("div.grow", h("div.title", x.name), h("div.meta", F.weekday(x.date) + " " + F.date(x.date))), h("span.small.muted", F.relative(x.date)))),
    tips.map(tp => h("div.row", h("span.tile.cat", { style: { background: "color-mix(in srgb, var(--accent) 20%, transparent)" } }, "💡"),
      h("div.grow", h("div.title", { style: { whiteSpace: "normal" } }, "Take " + F.weekday(tp.bridge) + " " + F.shortDate(tp.bridge) + " off"),
        h("div.meta", { style: { whiteSpace: "normal" } }, tp.holiday.name + " on " + F.weekday(tp.holiday.date) + " – 1 day gives you " + tp.free + " days off")),
      btn("Take it", { kind: "soft", small: true, onclick: () => { db.add("timeoff", { title: "Bridge day", from: F.iso(tp.bridge), to: F.iso(tp.bridge), type: "Vacation" }); toast("Bridge day planned - " + F.dayDate(tp.bridge)); } })))));

  root.append(h("div", { style: { textAlign: "center", margin: "14px 0 4px" } },
    btn(TO.perYear() + " days a year · " + TO.STATES[TO.state()], { kind: "ghost", small: true, icon: "gear", onclick: () => setupSheet() })));
  root.append(fab(() => timeoffSheet(null)));
}

function yearCard(b, t) {
  const taken = b.before + b.used, left = b.left;
  const pct = v => Math.max(0, Math.min(100, v / Math.max(1, b.total) * 100)) + "%";
  // this year's days from October on, last year's while they're still valid - never next year's
  const warn = left > 0 && (b.year < t.getFullYear() || (b.year === t.getFullYear() && t.getMonth() >= 9));
  // tap the card (or Edit) to correct the numbers: days per year, days left for this year
  return h("div.card", { onclick: () => setupSheet(b.year), style: { cursor: "pointer" } },
    h("div.cardhead", h("h2", tile("calendar", "--blue"), "Vacation " + b.year),
      btn("Edit", { kind: "ghost", small: true, icon: "gear", onclick: e => { e.stopPropagation(); setupSheet(b.year); } })),
    h("div", { style: { display: "flex", alignItems: "baseline", gap: "8px" } },
      h("span.serif" + (left < 0 ? ".red" : ""), { style: { fontSize: "32px" } }, String(left).replace(".", ",")), h("span.muted", (left === 1 ? "day" : "days") + " left")),
    h("div", { style: { display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", background: "var(--track)", margin: "8px 0 7px" } },
      h("div", { style: { width: pct(taken), background: "var(--accent)" } }), h("div", { style: { width: pct(b.planned), background: "var(--home)" } })),
    h("div.small.muted", { style: { display: "flex", gap: "14px", flexWrap: "wrap" } },
      h("span", h("span", { style: { color: "var(--accent)" } }, "● "), fmtDays(taken) + " taken"),
      h("span", h("span", { style: { color: "var(--home)" } }, "● "), fmtDays(b.planned) + " planned"),
      h("span", "○ " + fmtDays(Math.max(0, left)) + " left"), h("span", "· " + b.total + " a year")),
    warn ? h("div.small.warnc", { style: { marginTop: "8px" } }, "⚠️ " + fmtDays(left) + " of " + b.year + " expire on " + F.date(b.expires) + " - plan them") : null);
}

// Days per year, your state, and what's left right now (once, changeable later).
function setupCard() {
  return h("div.card",
    h("div.cardhead", h("h2", tile("calendar", "--blue"), "Time off")),
    h("div.small.muted", { style: { marginBottom: "10px", whiteSpace: "normal" } }, "Your vacation days, the public holidays of your state and how many days you have left. Set it up once:"),
    btn("Set up", { kind: "primary", onclick: () => setupSheet() }));
}

async function setupSheet(year) {
  const y = year || F.today().getFullYear();
  const per = h("input.field", { inputmode: "numeric", value: TO.perYear() || "", placeholder: "30" });
  const st = h("select.field", Object.entries(TO.STATES).map(([k, v]) => h("option", { value: k, selected: k === TO.state() }, v)));
  const leftNow = h("input.field", { inputmode: "decimal", value: TO.isSetUp() ? String(TO.availableBefore(y)).replace(".", ",") : "", placeholder: "e.g. 9" });
  const body = h("div",
    h("label", h("span.label.caps", "Vacation days per year"), per),
    h("label", h("span.label.caps", "State (for public holidays)"), st),
    h("label", h("span.label.caps", "Days left for " + y + ", before the breaks in Homebase"), leftNow),
    h("div.small.muted", { style: { marginTop: "8px", whiteSpace: "normal" } }, "What you had left before the breaks you entered here - Homebase takes those off by itself (oldest days first; a year's days can be used until 31 March of the next year). To change a break, tap it in the list."));
  const ok = await dialog(TO.isSetUp() ? "Vacation " + y : "Time off", body, [{ label: "Cancel", value: false }, { label: "Save", value: true, main: true }]);
  if (!ok) return;
  const n = parseInt(per.value, 10);
  if (!(n > 0 && n < 100)) { toast("Type your vacation days per year"); return; }
  await db.setSetting("vacation.perYear", n);
  await db.setSetting("vacation.state", st.value);
  const l = F.parseNumber(leftNow.value);
  if (l != null) await TO.setAvailableBefore(y, l);
  toast("Time off set up - " + n + " days a year, " + TO.STATES[st.value]);
  go("plan/timeoff");
}

// Add or change a break: what for, from, until, kind - with the work days counted live.
export function timeoffSheet(rec) {
  const isNew = !rec;
  const r = rec ? { ...rec } : { title: "", from: F.todayIso(), to: F.todayIso(), type: "Vacation" };
  const title = h("input.field", { value: r.title || "", placeholder: "Christmas break" });
  const from = h("input.field", { type: "date", value: r.from });
  const to = h("input.field", { type: "date", value: r.to || r.from });
  const types = h("div.chips", { style: { flexWrap: "wrap", marginTop: "10px" } });
  const info = h("div.card", { style: { margin: "12px 0 0", padding: "10px 12px" } });
  const draw = () => {
    if (to.value < from.value) to.value = from.value;
    r.from = from.value; r.to = to.value;
    types.innerHTML = "";
    for (const ty of Object.keys(TO.TYPES)) types.append(h("button.chip" + (r.type === ty ? ".on" : ""), { type: "button", onclick: () => { r.type = ty; draw(); } }, TYPE_EMOJI[ty] + " " + ty));
    const wd = TO.workDays(r), n = TO.countOf(r);
    // what's left after this break: count it as if it were saved
    const saved = db.all("timeoff");
    const i = rec ? saved.indexOf(rec) : -1;
    if (i >= 0) saved.splice(i, 1, r); else saved.push(r);
    const bal = TO.balances(); const row = TO.freeInARow(r);
    if (i >= 0) saved.splice(i, 1, rec); else saved.pop();
    const y = F.parseIso(r.to || r.from).getFullYear();
    const lefts = Object.values(bal).filter(b => b.year === y || b.year === y - 1).filter(b => b.year === y || b.left !== TO.balances()[b.year]?.left).map(b => fmtDays(Math.max(0, b.left)) + " left for " + b.year);
    info.innerHTML = "";
    info.append(h("div", h("span.serif", { style: { fontSize: "21px" } }, String(n).replace(".", ",")), " ", r.type === "Vacation" || r.type === "Half day" ? (n === 1 ? "vacation day" : "vacation days") : "days off - no vacation used",
      h("span.muted.small", " · " + wd + " work " + (wd === 1 ? "day" : "days") + ", weekends and holidays skipped")),
      h("div.small.muted", { style: { marginTop: "3px", whiteSpace: "normal" } }, (n > 0 ? lefts.join(" · ") + " · " : "") + "off " + row + " days in a row"));
  };
  for (const el of [from, to]) el.addEventListener("change", draw);
  draw();
  const s = sheet(isNew ? "Take days off" : "Days off", h("div",
    h("label", h("span.label.caps", "What for"), title),
    h("div.grid2", h("label", h("span.label.caps", "From"), from), h("label", h("span.label.caps", "Until"), to)),
    types, info), {
    actions: [
      isNew ? null : btn("Delete", { kind: "danger", icon: "trash", onclick: () => { const idx = db.remove("timeoff", rec); s.close(); toast("Deleted", "Undo", () => { db.all("timeoff").splice(Math.max(0, idx), 0, rec); db.save("timeoff"); }); } }),
      btn("Cancel", { kind: "ghost", onclick: () => s.close() }),
      btn("Save", { kind: "primary", onclick: () => {
        if (!from.value) { toast("Pick the first day"); return; }
        const data = { title: title.value.trim() || r.type, from: from.value, to: to.value || from.value, type: r.type };
        if (isNew) db.add("timeoff", data); else { Object.assign(rec, data); db.touch(rec); db.save("timeoff"); }
        s.close();
        toast((r.type === "Vacation" || r.type === "Half day" ? fmtDays(TO.countOf(data)) + " of vacation" : r.type) + " · " + data.title);
      } })].filter(Boolean)
  });
}
