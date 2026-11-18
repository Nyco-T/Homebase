// The nine lists Homebase keeps - the same fields and rules as the desktop app (src/core/Kinds.java).

import * as db from "./db.js";
import * as F from "./fmt.js";

const f = (key, label, type, more = {}) => ({ key, label, type, ...more });

export const KINDS = {
  events: { title: "Events", one: "Event", icon: "calendar", color: "--today", titleKey: "title", fields: [
    f("title", "Title", "text"), f("date", "Date", "date"), f("time", "Time", "text", { hint: "18:30" }), f("end", "Until", "date"),
    f("place", "Where", "text"), f("repeat", "Repeats", "choice", { choices: ["Never", "Weekly", "Monthly", "Yearly"] }),
    f("category", "Kind", "open", { choices: ["Birthday", "Appointment", "Party", "Concert", "Sport", "Family", "Holiday", "Other"] }),
    f("notes", "Notes", "long")],
    defaults: () => ({ date: F.todayIso(), repeat: "Never" }) },

  tasks: { title: "Tasks", one: "Task", icon: "check", color: "--today", titleKey: "title", fields: [
    f("title", "Task", "text"), f("due", "Due", "date"), f("time", "Time", "time"), f("priority", "Priority", "choice", { choices: ["High", "Normal", "Low"] }),
    f("list", "List", "open", { choices: ["Personal", "Errands", "Home", "Admin", "Money", "Health", "Shopping"] }),
    f("repeat", "Repeats", "choice", { choices: ["Never", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Yearly"] }),
    f("steps", "Steps", "checklist"), f("notes", "Notes", "long")],
    defaults: () => ({ priority: "Normal", repeat: "Never", done: false }) },

  notes: { title: "Notes", one: "Note", icon: "note", color: "--notes", titleKey: "title", fields: [
    f("title", "Title", "text"), f("body", "Note", "long", { rows: 10 }), f("tags", "Tags", "tags"), f("pinned", "Pinned", "bool")],
    defaults: () => ({}) },

  transactions: { title: "Money", one: "Entry", icon: "wallet", color: "--money", titleKey: "description", fields: [
    f("description", "Description", "text"), f("amount", "Amount", "money", { hint: "−12,50 for an expense" }),
    f("category", "Category", "open"), f("account", "Account", "open", { choices: ["Bank", "Cash"] }), f("date", "Date", "date"), f("notes", "Notes", "long")],
    defaults: () => ({ date: F.todayIso() }) },

  repeats: { title: "Repeating entries", one: "Repeating entry", icon: "repeat", color: "--money", titleKey: "description", fields: [
    f("description", "Description", "text"), f("amount", "Amount", "money", { hint: "negative = expense" }),
    f("category", "Category", "open"), f("account", "Account", "open", { choices: ["Bank", "Cash"] }), f("day", "Day of month", "number"), f("paused", "Paused", "bool")],
    defaults: () => ({ day: 1, lastAdded: F.monthKey(F.addMonths(F.today(), -1)) }) },

  shopping: { title: "Shopping list", one: "Item", icon: "cart", color: "--home", titleKey: "item", fields: [
    f("item", "Item", "text"), f("qty", "How much", "text", { hint: "2, 500 g, 1 pack" }),
    f("store", "Shop", "open", { choices: ["Supermarkt", "Drogerie", "Bäckerei", "Markt", "Online"] }), f("price", "Price", "money"), f("notes", "Notes", "text")],
    defaults: () => ({ done: false }) },

  meals: { title: "Meal plan", one: "Meal", icon: "grid", color: "--home", titleKey: "title", fields: [
    f("title", "Meal", "text"), f("date", "Day", "date"), f("slot", "When", "choice", { choices: ["Breakfast", "Lunch", "Dinner", "Snack"] }), f("notes", "Notes", "text")],
    defaults: () => ({ date: F.todayIso(), slot: "Dinner" }) },

  recipes: { title: "Recipes", one: "Recipe", icon: "pot", color: "--home", titleKey: "name", fields: [
    f("name", "Name", "text"), f("category", "Category", "open", { choices: ["Breakfast", "Main", "Pasta", "Soup", "Salad", "Snack", "Dessert", "Baking"] }),
    f("minutes", "Time (min)", "number"), f("servings", "Servings", "number"), f("favorite", "Favorite", "bool"),
    f("ingredients", "Ingredients", "checklist"), f("steps", "Steps", "long", { rows: 8 }), f("tags", "Tags", "tags"), f("source", "Source", "url")],
    defaults: () => ({}) },

  chores: { title: "Chores", one: "Chore", icon: "sparkle", color: "--home", titleKey: "name", fields: [
    f("name", "Job", "text"), f("area", "Area", "open", { choices: ["Kitchen", "Bathroom", "Living room", "Bedroom", "Laundry", "Plants", "Outside", "Other"] }),
    f("every", "Every (days)", "number"), f("lastDone", "Last done", "date"), f("who", "Who", "text"), f("notes", "Notes", "long")],
    defaults: () => ({ every: 7, lastDone: F.todayIso() }) },
};

// "today 09:00" - a task's day and, if it has one, its time
export const dueText = r => { const x = F.parseIso(r?.due); return x ? F.relative(x) + (r.time ? " " + r.time : "") : ""; };
// sorts by day, then time (no time = end of the day)
export const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.time || "99").localeCompare(b.time || "99");
// The words of a record you can search for - its texts, not its field names, ids or timestamps.
const NOT_SEARCHED = new Set(["id", "created", "updated", "auto", "recipe", "repeat", "transfer", "repeatMonth", "phoneCalendar"]);
export function searchText(rec) {
  const out = [];
  const walk = v => { if (v == null) return; if (typeof v === "string" || typeof v === "number") out.push(String(v)); else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === "object") Object.values(v).forEach(walk); };
  for (const [k, v] of Object.entries(rec || {})) if (!NOT_SEARCHED.has(k) && typeof v !== "boolean") walk(v);
  return out.join(" ").toLowerCase();
}
export const titleOf = (kind, r) => (r && r[KINDS[kind].titleKey]) || "Untitled " + KINDS[kind].one.toLowerCase();
export const d = (r, key) => F.parseIso(r && r[key]);
export const num = (r, key) => typeof r?.[key] === "number" ? r[key] : (F.parseNumber(r?.[key]) ?? 0);
export const isOn = (r, key) => r?.[key] === true || r?.[key] === "true";

// The day after "from" for a repeat word.
export function nextDate(from, cycle) {
  switch (cycle) {
    case "Daily": return F.addDays(from, 1);
    case "Weekly": return F.addDays(from, 7);
    case "Every 2 weeks": return F.addDays(from, 14);
    case "Quarterly": return F.addMonths(from, 3);
    case "Yearly": return F.addMonths(from, 12);
    default: return F.addMonths(from, 1);
  }
}

// The next time an event happens (repeating ones move forward to today or later).
export function nextEvent(r) {
  let x = d(r, "date");
  if (!x) return null;
  if (!r.repeat || r.repeat === "Never") return x;
  const t = F.today();
  for (let i = 0; x < t && i < 5000; i++) x = nextDate(x, r.repeat);
  return x;
}

export function nextChore(r) {
  const last = d(r, "lastDone");
  return last ? F.addDays(last, Math.max(1, num(r, "every") || 7)) : F.today();
}

// Ticks a task off; a repeating task comes back with its next date.
export function finishTask(r) {
  r.done = true;
  r.doneDate = F.todayIso();
  db.touch(r);
  // a "get money back" task (from Split) books the money into Money when it's ticked
  if (num(r, "refund") > 0 && !r.refundBooked) {
    const e = book((r.refundFrom || "Someone") + " paid back", num(r, "refund"), "Paid back", F.todayIso(), r.refundFor || "");
    r.refundBooked = e.id;
  }
  if (r.repeat && r.repeat !== "Never") {
    const again = JSON.parse(JSON.stringify(r));
    delete again.id; delete again.created;
    again.done = false; delete again.doneDate;
    let next = nextDate(d(r, "due") || F.today(), r.repeat);
    while (next < F.today()) next = nextDate(next, r.repeat);
    again.due = F.iso(next);
    for (const s of again.steps || []) s.done = false;
    db.add("tasks", again);
    r.nextCopy = again.id;   // so Undo removes exactly this copy
  }
  db.save("tasks");
}

// Split an expense: you paid it all, someone owes you a part. Makes a task that books the money back when ticked.
export function splitEntry(entry, who, amount) {
  return db.add("tasks", { title: "Get " + F.money(amount) + " back from " + who, due: F.iso(F.addDays(F.today(), 7)), priority: "Normal",
    list: "Money", repeat: "Never", done: false, refund: amount, refundFrom: who, refundFor: entry.description || "",
    notes: "Split: " + (entry.description || "") + " · " + F.date(d(entry, "date")) + " · you paid " + F.money(Math.abs(num(entry, "amount"))) });
}

export function choreDone(r) {
  r.lastDone = F.todayIso();
  (r.history = r.history || []).push(F.todayIso());
  db.touch(r);
  db.save("chores");
}

// A balance correction only fixes the balance - it's not income or spending.
export const isCorrection = r => /correction|korrektur/i.test(r?.category || "");

// ---------------- Accounts: Bank, Cash (and any you add) ----------------
// An entry without an account is Bank. Moving money between accounts (a cash withdrawal) is a pair of entries with
// the category "Transfer" - it's neither income nor spending, like a balance correction.
export const ACCOUNTS = ["Bank", "Cash"];
export const accounts = () => { const a = db.setting("accounts", null); return Array.isArray(a) && a.length ? a : ACCOUNTS; };
export const accountOf = x => (x && x.account) || "Bank";
export const accountIcon = a => a === "Cash" ? "💵" : a === "Bank" ? "🏦" : /paypal/i.test(a) ? "🅿️" : /sav|spar/i.test(a) ? "🐷" : "💳";
export const isTransfer = x => x?.category === "Transfer" && !!x.transfer;
// not income or spending: balance corrections and money moved between your own accounts
export const isNeutral = x => isCorrection(x) || isTransfer(x);

// What you have on a day: every entry up to and including it, carried over from month to month (one account or all).
export function balanceOn(day, account) {
  const end = F.iso(day);
  return db.all("transactions").filter(x => x.date && x.date <= end && (!account || accountOf(x) === account)).reduce((a, x) => a + num(x, "amount"), 0);
}

// "Set balance": you say what's really in an account (or in your wallet), the difference is booked as today's correction
// there (an existing correction from today is adjusted instead of adding a second one). Returns the difference.
export function setBalance(target, account = "Bank") {
  const today = F.todayIso();
  if (account === "Cash") db.setSetting("cashChecked", today);
  const diff = Math.round((target - balanceOn(F.today(), account)) * 100) / 100;
  if (Math.abs(diff) < 0.005) return 0;
  const existing = db.all("transactions").find(x => isCorrection(x) && x.date === today && accountOf(x) === account);
  if (existing) { existing.amount = Math.round((num(existing, "amount") + diff) * 100) / 100; db.touch(existing); db.save("transactions"); }
  else db.add("transactions", { description: "Balance correction", amount: diff, category: "Correction", account, date: today, notes: "Set " + account + " to " + F.money(target) });
  return diff;
}

// Move money between your accounts: "Cash withdrawal" (Bank -> Cash), "Cash deposit" (Cash -> Bank), or a transfer.
export function moveMoney(amount, from, to, dateIso) {
  const link = db.newId();
  const description = from === "Bank" && to === "Cash" ? "Cash withdrawal" : from === "Cash" && to === "Bank" ? "Cash deposit" : "Transfer " + from + " → " + to;
  const date = dateIso || F.todayIso();
  const out = db.add("transactions", { description, amount: -amount, category: "Transfer", account: from, date, transfer: link });
  const into = db.add("transactions", { description, amount, category: "Transfer", account: to, date, transfer: link });
  return [out, into];
}
export const transferPair = x => db.all("transactions").filter(t => t.transfer && t.transfer === x.transfer);

// Which account an entry is paid from: the one you used most for the same description lately (Bäcker -> Cash), else Bank.
export function guessAccount(description) {
  const text = (description || "").trim().toLowerCase();
  if (!text) return null;
  const same = db.all("transactions").filter(t => !isNeutral(t) && (t.description || "").trim().toLowerCase() === text)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);
  if (!same.length) return null;
  const count = {};
  for (const t of same) count[accountOf(t)] = (count[accountOf(t)] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

// Puts an entry into Money (negative = expense).
export function book(description, amount, category, dateIso, note) {
  const r = { description, amount, category: category || "Other", date: dateIso || F.todayIso() };
  if (note) r.notes = note;
  return db.add("transactions", r);
}

// The category this description had last time ("REWE" -> "Groceries"), else "Other".
export function guessCategory(description) {
  const text = (description || "").toLowerCase().trim();
  for (const rule of db.all("rules")) {
    const m = (rule.match || "").toLowerCase().trim();
    if (m && text.includes(m) && rule.category) return rule.category;
  }
  let best = null;
  for (const t of db.all("transactions")) {
    if ((t.description || "").toLowerCase() === text && t.category && t.category !== "Other" && (!best || t.date > best.date)) best = t;
  }
  return best ? best.category : "Other";
}

export function names(kind, key) {
  const out = new Set();
  for (const r of db.all(kind)) if (r[key]) out.add(r[key]);
  return [...out].sort((a, b) => a.localeCompare(b));
}

// Repeating entries (rent, salary): every month since "lastAdded" that's due. With "Ask before booking" on (the default)
// an entry isn't booked until you say it really came / was paid ("Did your salary arrive?"); off = booked on its day.
export const confirmRepeatsOn = () => db.setting("rule.money.confirm-repeats", true) !== false;

// The months of a repeat that are due by today and not booked yet, oldest first: [{ key: "2026-11", day: Date }]
function dueMonths(rule) {
  const t = F.today();
  const now = F.monthKey(t);
  const out = [];
  let [y, m] = (rule.lastAdded || F.monthKey(F.addMonths(t, -1))).split("-").map(Number);
  for (let guard = 0; guard < 36; guard++) {
    m++; if (m > 12) { m = 1; y++; }
    const key = y + "-" + String(m).padStart(2, "0");
    if (key > now) break;
    const day = new Date(y, m - 1, Math.max(1, Math.min(num(rule, "day") || 1, F.daysInMonth(y, m - 1))));
    if (day > t) break;
    out.push({ key, day });
  }
  return out;
}

// Already booked by hand that month (same text and amount)? Then it counts as done - no second entry, no question.
// (an entry from the repeat itself counts for the month it belongs to - a late salary booked on 2.12. is still November's)
export const repeatMonthOf = x => x.repeatMonth || (x.date || "").slice(0, 7);
export const bookedByHand = (rule, key) => db.all("transactions").some(x => x.repeat === rule.id ? repeatMonthOf(x) === key
  : (x.date || "").startsWith(key) && (x.description || "").toLowerCase() === (rule.description || "").toLowerCase() && Math.abs(num(x, "amount") - num(rule, "amount")) < 0.01);

function bookRepeat(rule, key, dateIso, amount) {
  const e = { id: db.newId(), created: db.stamp(), updated: db.stamp(), description: rule.description, amount,
    category: rule.category || "Other", date: dateIso, repeat: rule.id, repeatMonth: key };
  if (rule.account && rule.account !== "Bank") e.account = rule.account;
  db.all("transactions").push(e);
  rule.lastAdded = key;
  delete rule.notYet;
  db.touch(rule);
  return e;
}

export function addMissingRepeats() {
  let changed = false;
  for (const rule of db.all("repeats")) {
    if (isOn(rule, "paused")) continue;
    for (const { key, day } of dueMonths(rule)) {
      if (bookedByHand(rule, key)) { rule.lastAdded = key; db.touch(rule); changed = true; continue; }
      if (confirmRepeatsOn()) break;   // waits for your yes
      bookRepeat(rule, key, F.iso(day), num(rule, "amount"));
      changed = true;
    }
  }
  if (changed) { db.save("transactions"); db.save("repeats"); }
}

// What waits for your yes: per repeat the oldest month that's due and not booked.
// late = you said "not yet" on an earlier day, so a yes books it on the day you confirm (when it really came).
export function waitingRepeats() {
  if (!confirmRepeatsOn()) return [];
  const today = F.todayIso();
  const out = [];
  for (const rule of db.all("repeats")) {
    if (isOn(rule, "paused")) continue;
    const first = dueMonths(rule).find(x => !bookedByHand(rule, x.key));
    if (!first) continue;
    const said = (rule.notYet || "").split("@");
    const notYetFor = said[0] === first.key ? said[1] : "";
    out.push({ rule, key: first.key, day: first.day, late: !!notYetFor && notYetFor < today, askedToday: notYetFor === today });
  }
  return out.sort((a, b) => a.day - b.day);
}

export const waitQuestion = w => num(w.rule, "amount") > 0 ? "Did " + w.rule.description + " arrive?" : "Was " + w.rule.description + " paid?";

// Yes: book it (on its day, or today when it came late). Returns what undoRepeat needs.
export function confirmRepeat(w, amount) {
  const prev = w.rule.lastAdded;
  const notYet = w.rule.notYet;
  const e = bookRepeat(w.rule, w.key, w.late ? F.todayIso() : F.iso(w.day), amount ?? num(w.rule, "amount"));
  db.save("transactions"); db.save("repeats");
  return { e, prev, notYet };
}
export function undoRepeat(w, done) {
  db.remove("transactions", done.e);
  w.rule.lastAdded = done.prev;
  if (done.notYet) w.rule.notYet = done.notYet;
  db.touch(w.rule);
  db.save("repeats");
}
// Not yet: ask again tomorrow.
export function notYetRepeat(w) {
  w.rule.notYet = w.key + "@" + F.todayIso();
  db.touch(w.rule);
  db.save("repeats");
}

// Everything with a date from the lists (calendar, Home, bell). lead = days before it starts reminding (-1 = never).
export function dues() {
  const out = [];
  for (const e of db.all("events")) {
    const n = nextEvent(e);
    if (n) out.push({ date: n, title: e.title || "Event", time: (e.time || "").slice(0, 5), detail: [e.time, e.place, e.source === "iphone" ? "iPhone" : ""].filter(Boolean).join(" · "), kind: "events", id: e.id, lead: 1, icon: e.category === "Birthday" ? "gift" : e.source === "iphone" ? "phone" : "calendar", color: "--today" });
  }
  for (const r of db.all("tasks")) {
    const due = d(r, "due");
    if (due && !isOn(r, "done")) out.push({ date: due, title: r.title, time: r.time || "", detail: ["task", r.list].filter(Boolean).join(" · "), kind: "tasks", id: r.id, lead: 0, icon: "check", color: "--today" });
  }
  for (const r of db.all("timeoff")) {
    const from = F.parseIso(r.from);
    if (from) out.push({ date: from, title: (r.title || r.type || "Time off") + " starts", detail: F.shortDate(from) + " – " + F.shortDate(F.parseIso(r.to) || from), kind: "timeoff", id: r.id, lead: -1, icon: "calendar", color: "--blue" });
  }
  for (const c of db.all("chores")) {
    out.push({ date: nextChore(c), title: c.name, detail: c.area || "", kind: "chores", id: c.id, lead: 0, icon: "sparkle", color: "--home" });
  }
  return out.filter(x => x.date).sort((a, b) => a.date - b.date);
}
