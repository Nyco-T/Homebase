// Every automation rule of Homebase Mobile - the same ones as the desktop app (src/core/AutoRules.java),
// minus the inbox folder (a phone has none).

import * as db from "./db.js";
import * as F from "./fmt.js";
import { rule, reminder, find, NEVER, marks, setBookkeeping } from "./auto.js";
import * as TO from "./timeoff.js";
import { toBuy, onList } from "./cook.js";
import { d, num, isOn, nextEvent, guessCategory, bookedByHand, waitingRepeats, waitQuestion, isNeutral, balanceOn } from "./kinds.js";

const norm = s => (s || "").toLowerCase().replace(/[0-9/.#*-]+/g, " ").replace(/\s+/g, " ").trim();
const step = text => ({ text, done: false });
const inMonth = (rec, y, m) => { const x = d(rec, "date"); return x && x.getFullYear() === y && x.getMonth() === m; };

// Rent, savings, transfers, salary … aren't everyday spending.
function notEveryday(t) {
  const text = ((t.category || "") + " " + (t.description || "")).toLowerCase();
  return ["rent", "miete", "nebenkosten", "savings", "sparen", "transfer", "umbuchung", "kredit", "loan", "income", "gehalt", "salary", "tax", "steuer", "correction", "korrektur"].some(w => text.includes(w));
}

export function register() {

  // ---------------- Money ----------------
  rule("money.auto-categorize", "money", "Sort entries into categories",
    "Entries without a category (or \"Other\") get the one your rules or the same entry had before.", 2, 3, () => {
      const out = [];
      for (const t of db.all("transactions")) {
        if (t.category && t.category !== "Other") continue;
        const c = guessCategory(t.description);
        if (!c || c === "Other") continue;
        out.push(find("cat:" + t.id, "“" + t.description + "” sorted into " + c, F.signedMoney(num(t, "amount")), "Use " + c, tx => tx.set("transactions", t, "category", c)));
      }
      return out;
    });

  rule("money.monthly-report", "money", "Monthly money report",
    "On the 1st a note with last month's income, spending, top categories and the change to the month before.", NEVER, 4, () => {
      const t = F.today();
      const last = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const before = new Date(t.getFullYear(), t.getMonth() - 2, 1);
      const month = db.all("transactions").filter(x => inMonth(x, last.getFullYear(), last.getMonth()) && !isNeutral(x));
      if (!month.length) return [];
      const sum = (list, pos) => list.map(x => num(x, "amount")).filter(v => pos ? v > 0 : v < 0).reduce((a, b) => a + b, 0);
      const income = sum(month, true), spent = -sum(month, false);
      const prev = db.all("transactions").filter(x => inMonth(x, before.getFullYear(), before.getMonth()) && !isNeutral(x));
      const prevSpent = -sum(prev, false);
      const cats = {};
      for (const x of month) if (num(x, "amount") < 0) cats[x.category || "Other"] = (cats[x.category || "Other"] || 0) - num(x, "amount");
      let b = "Income: " + F.money(income) + "\nSpent: " + F.money(spent);
      if (prevSpent > 0) b += "  (" + (spent >= prevSpent ? "+" : "") + Math.round((spent - prevSpent) / prevSpent * 100) + " % vs the month before)";
      b += "\nLeft over: " + F.signedMoney(income - spent) + "\n";
      if (income > 0) b += "Savings rate: " + F.percent(Math.max(0, (income - spent) / income)) + "\n";
      b += "\nTop categories:\n" + Object.entries(cats).sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, v]) => "- " + k + ": " + F.money(v)).join("\n");
      const name = F.monthName(last.getFullYear(), last.getMonth());
      return [find("report:" + F.monthKey(last), "Money report for " + name, "written to your notes", "Write it",
        tx => tx.add("notes", { title: "Money report · " + name, body: b, tags: ["automation", "money"] }))];
    });

  reminder("money.forecast", "money", "Month-end forecast",
    "Warns when this month is heading for a minus (repeating payments still to come + your usual everyday spending).", () => {
      if (!db.all("transactions").length) return [];
      const f = forecast();
      if (f.end >= 0) return [];
      return [{ date: F.today(), title: "This month may end at " + F.signedMoney(f.end), detail: "still to come " + F.signedMoney(f.coming) + ", everyday ≈ " + F.signedMoney(f.rest), kind: "transactions", id: null, lead: 0, icon: "trend", color: "--red" }];
    });

  reminder("money.count-cash", "money", "Count your cash",
    "Once you use the Cash account: every 2 weeks a reminder to count your wallet, so the cash balance stays right (one tap to set it).", () => {
      const cash = db.all("transactions").filter(x => x.account === "Cash");
      if (!cash.length) return [];
      const since = F.parseIso(db.setting("cashChecked", "")) || F.parseIso(cash.map(x => x.date).sort()[0]);
      if (!since || F.daysBetween(since, F.today()) < 14) return [];
      return [{ date: F.today(), title: "Count your cash", detail: "Homebase thinks " + F.money(balanceOn(F.today(), "Cash")) + " · tap to set it", kind: "countcash", id: null, lead: 0, icon: "wallet", color: "--money" }];
    });

  reminder("money.confirm-repeats", "money", "Ask before booking repeating entries",
    "Salary, rent and other repeating entries are only booked when you say they really came or were paid (\"Did your salary arrive?\" - Yes / Not yet, asked again the next day). Off: they're booked on their day by themselves.", () =>
      waitingRepeats().filter(w => !w.askedToday).map(w => ({ date: w.day, title: waitQuestion(w) + " " + F.signedMoney(num(w.rule, "amount")),
        detail: (w.late ? "not there yet on " : "due ") + F.shortDate(w.day) + " · tap to answer", kind: "confirm", id: w.rule.id, lead: 0, icon: "repeat", color: "--money" })));

  reminder("money.expected", "money", "Repeating payments in the calendar",
    "Rent, salary and other repeating entries - and Money entries booked for a later day - show on the calendar on the day they come.", () => {
      const out = [];
      const t = F.today();
      for (const r of db.all("repeats")) {
        if (isOn(r, "paused")) continue;
        for (let i = 0; i < 2; i++) {
          const m = new Date(t.getFullYear(), t.getMonth() + i, 1);
          if ((r.lastAdded || "") >= F.monthKey(m)) continue;
          const day = new Date(m.getFullYear(), m.getMonth(), Math.max(1, Math.min(num(r, "day") || 1, F.daysInMonth(m.getFullYear(), m.getMonth()))));
          // already booked by hand in that month (same text and amount)? then the booked entry shows instead
          const booked = bookedByHand(r, F.monthKey(m));
          if (day >= t && !booked) out.push({ date: day, title: r.description + " " + F.signedMoney(num(r, "amount")), detail: "repeating entry", kind: "repeats", id: r.id, lead: -1, icon: "repeat", color: "--money" });
        }
      }
      // entries already booked for a later day (e.g. the salary on the 28th) show on their day too
      const limit = F.addDays(t, 60);
      for (const x of db.all("transactions")) {
        const day = d(x, "date");
        if (day && day > t && day <= limit) out.push({ date: day, title: (x.description || "Entry") + " " + F.signedMoney(num(x, "amount")), detail: "booked in Money", kind: "transactions", id: x.id, lead: -1, icon: "wallet", color: "--money" });
      }
      return out;
    });

  // ---------------- Tasks & calendar ----------------
  reminder("tasks.phone-calendar", "tasks", "Keep the iPhone calendar fresh",
    "Once you read your iPhone calendar into Homebase, the bell reminds you after 2 days to update it (one tap - Homebase reads what the shortcut copied).", () => {
      const last = F.parseIso(db.setting("phonecal.last", ""));
      if (!last || F.daysBetween(last, F.today()) < 2) return [];
      return [{ date: F.today(), title: "Update your iPhone calendar", detail: "last read " + F.relative(last) + " · tap to read it", kind: "phonecal", id: null, lead: 0, icon: "phone", color: "--today" }];
    });

  reminder("tasks.bridge-days", "tasks", "Bridge days",
    "When a public holiday falls on a Tuesday or Thursday, the bell suggests taking the Monday / Friday off (1 day gives you 4) - from 6 weeks before.", () => {
      if (!TO.isSetUp()) return [];
      const t = F.today();
      return TO.bridgeDays(t, F.addDays(t, 42)).map(b => ({ date: b.bridge, title: "Bridge day: take " + F.weekday(b.bridge) + " " + F.shortDate(b.bridge) + " off",
        detail: b.holiday.name + " – 1 day gives you 4 off", kind: "bridge", id: null, lead: 42, icon: "calendar", color: "--blue" }));
    });

  reminder("tasks.vacation-left", "tasks", "Vacation days that expire",
    "From October: a reminder when you still have vacation days of this year (they can be used until 31 March). From January: for last year's leftover days.", () => {
      if (!TO.isSetUp()) return [];
      const t = F.today();
      const bal = TO.balances();
      const b = t.getMonth() >= 9 ? bal[t.getFullYear()] : t.getMonth() <= 2 ? bal[t.getFullYear() - 1] : null;
      if (!b || b.left <= 0) return [];
      return [{ date: t, title: String(b.left).replace(".", ",") + " vacation days left for " + b.year, detail: "they expire on " + F.date(b.expires) + " · tap to plan them", kind: "vacation-left", id: null, lead: 0, icon: "calendar", color: "--warn" }];
    });

  rule("tasks.postponed", "tasks", "Moved too often",
    "A task whose due date was pushed back three times gets a nudge: move it to Someday?", 2, NEVER, () =>
      db.all("tasks").filter(t => !isOn(t, "done") && t.due && (t.postponed || 0) >= 3).map(t =>
        find("postponed:" + t.id + ":" + Math.floor(t.postponed / 3), "“" + t.title + "” was moved " + t.postponed + " times", "split it up, or park it in Someday?", "Move to Someday",
          tx => { tx.set("tasks", t, "due", null); tx.set("tasks", t, "postponed", 0); })));

  rule("tasks.stale", "tasks", "Clear old overdue tasks",
    "Tasks overdue for more than 30 days move to Someday (with a note when they were due), so Today stays honest.", 2, 3, () => {
      const limit = F.addDays(F.today(), -30);
      return db.all("tasks").filter(t => !isOn(t, "done") && d(t, "due") && d(t, "due") < limit && (!t.repeat || t.repeat === "Never")).map(t =>
        find("stale:" + t.id + ":" + t.due, "“" + t.title + "” moved to Someday", "was due " + F.date(d(t, "due")), "Move to Someday",
          tx => { const was = t.due; tx.set("tasks", t, "due", null); tx.set("tasks", t, "notes", ((t.notes || "") + "\nWas due " + F.date(F.parseIso(was)) + ".").trim()); }));
    });

  rule("tasks.birthday-gift", "tasks", "Gift task before birthdays",
    "10 days before a birthday in your calendar (a yearly event of the kind Birthday): a task to get a gift.", 2, 3, () => {
      const out = [];
      for (const e of db.all("events")) {
        const lower = (e.title || "").toLowerCase();
        const birthday = e.category === "Birthday" || lower.includes("birthday") || lower.includes("geburtstag");
        const next = nextEvent(e);
        if (!birthday || !next || next > F.addDays(F.today(), 10)) continue;
        const due = F.addDays(next, -3) < F.today() ? F.today() : F.addDays(next, -3);
        out.push(find("bday-gift:" + e.id + ":" + next.getFullYear(), "Task: gift for " + e.title, F.dayDate(next) + " (" + F.relative(next) + ")", "Add task",
          tx => tx.add("tasks", { title: "Gift: " + e.title + " (" + F.shortDate(next) + ")", due: F.iso(due), priority: "Normal", list: "Personal", repeat: "Never", done: false,
            steps: [step("Get a gift"), step("Write a card / message")], notes: e.notes || undefined })));
      }
      return out;
    });

  rule("tasks.weekly-review", "tasks", "Weekly review",
    "Every Sunday evening a note: tasks done, money spent and what's coming next week.", NEVER, 4, () => {
      const now = new Date();
      let sunday = F.addDays(F.today(), -F.today().getDay());
      if (now.getDay() === 0 && now.getHours() < 17) sunday = F.addDays(sunday, -7);
      if (F.daysBetween(sunday, F.today()) > 6) return [];
      const monday = F.addDays(sunday, -6);
      const inWeek = x => x && x >= monday && x <= sunday;
      if (!db.all("tasks").length && !db.all("transactions").length) return [];
      const done = db.all("tasks").filter(t => isOn(t, "done") && inWeek(d(t, "doneDate")));
      const spent = -db.all("transactions").filter(t => inWeek(d(t, "date")) && num(t, "amount") < 0 && !isNeutral(t)).reduce((a, t) => a + num(t, "amount"), 0);
      const week = weekNumber(monday);
      let b = "Tasks done: " + done.length + "\n" + done.slice(0, 10).map(t => "- " + t.title).join("\n") + "\n\nSpent: " + F.money(spent) + "\n";
      const next = allDatesBetween(F.addDays(sunday, 1), F.addDays(sunday, 7));
      if (next.length) b += "\nNext week:\n" + next.slice(0, 12).map(x => "- " + F.dayDate(x.date) + "  " + x.title).join("\n");
      return [find("review:" + monday.getFullYear() + "-W" + week, "Weekly review for week " + week, "written to your notes", "Write it",
        tx => tx.add("notes", { title: "Week review · KW " + week + " (" + F.shortDate(monday) + " – " + F.shortDate(sunday) + ")", body: b, tags: ["automation", "review"] }))];
    });

  // ---------------- Shopping, meals & chores ----------------
  rule("home.often-bought", "home", "Restock what you buy often",
    "Things you buy regularly go back on the shopping list when it's about time again.", 2, 3, () => {
      const out = [];
      for (const log of db.all("buylog")) {
        const dates = [...new Set(log.dates || [])].map(F.parseIso).filter(Boolean).sort((a, b) => a - b);
        if (dates.length < 3) continue;
        let gaps = 0;
        for (let i = 1; i < dates.length; i++) gaps += F.daysBetween(dates[i - 1], dates[i]);
        const every = Math.round(gaps / (dates.length - 1));
        const last = dates[dates.length - 1];
        if (every < 2 || every > 60 || F.addDays(last, every) > F.today() || onList(log.name)) continue;
        out.push(find("often:" + log.item + ":" + F.iso(last), "“" + log.name + "” back on the shopping list", "you buy it about every " + every + " days", "Add it",
          tx => tx.add("shopping", { item: log.name, done: false, notes: "restock", ...(log.store ? { store: log.store } : {}) })));
      }
      return out;
    });

  rule("home.meal-ingredients", "home", "Meal plan → shopping list",
    "Ingredients of planned meals for the next 7 days go onto the shopping list (if they aren't there yet).", 2, 3, () => {
      const out = [];
      const t = F.today(), end = F.addDays(t, 7);
      for (const meal of db.all("meals")) {
        const day = d(meal, "date");
        if (!day || day < t || day > end || !meal.recipe) continue;
        const recipe = db.byId("recipes", meal.recipe);
        if (!recipe) continue;
        const missing = toBuy((recipe.ingredients || []).map(i => i.text));   // by the thing itself - "Feta" on the list counts
        if (!missing.length) continue;
        out.push(find("meal-ing:" + meal.id, F.plural(missing.length, "ingredient", "ingredients") + " for " + recipe.name + " on the list", F.dayDate(day) + ": " + missing.map(x => x.item).join(", "), "Add to list",
          tx => { for (const x of missing) tx.add("shopping", { ...x, done: false, notes: recipe.name + " · " + F.dayDate(day) }); }));
      }
      return out;
    });

  rule("home.meal-suggest", "home", "Fill the meal plan",
    "Dinners not planned yet in the next 3 days get a suggestion from your favourite recipes (not cooked lately).", 2, NEVER, () => {
      const recipes = db.all("recipes");
      if (recipes.length < 3 || !db.all("meals").length) return [];
      const lastCooked = {};
      for (const m of db.all("meals")) if (m.recipe && m.date && (!lastCooked[m.recipe] || m.date > lastCooked[m.recipe])) lastCooked[m.recipe] = m.date;
      const ranked = [...recipes].sort((a, b) => (b.favorite === true) - (a.favorite === true) || (lastCooked[a.id] || "").localeCompare(lastCooked[b.id] || ""));
      const out = [];
      let pick = 0;
      for (let i = 0; i < 3 && pick < ranked.length; i++) {
        const day = F.iso(F.addDays(F.today(), i));
        if (db.all("meals").some(m => m.date === day && m.slot === "Dinner")) continue;
        const r = ranked[pick++];
        out.push(find("meal-sug:" + day, r.name + " for dinner " + (i === 0 ? "today" : i === 1 ? "tomorrow" : F.dayDate(F.parseIso(day))) + "?",
          (r.favorite ? "a favourite" : "one of your recipes") + (lastCooked[r.id] ? ", last " + F.relative(F.parseIso(lastCooked[r.id])) : ""), "Plan it",
          tx => tx.add("meals", { title: r.name, date: day, slot: "Dinner", recipe: r.id })));
      }
      return out;
    });

  setBookkeeping(bookkeepingNow);
}

// Things you have at home anyway never go on the list (Settings → "Always at home").
// Spices by their spice names only - "Paprika" and "pepper" alone are also vegetables (bell peppers).
export const DEFAULT_STAPLES = "oil, öl, salt, salz, black pepper, pfeffer, oregano, paprikapulver, paprika edelsüß, water, wasser";
const OLD_DEFAULT = "oil, öl, salt, salz, pepper, pfeffer, oregano, paprika, water, wasser";
export const staplesText = () => { const v = db.setting("staples", DEFAULT_STAPLES); return v === OLD_DEFAULT ? DEFAULT_STAPLES : v; };
export function isStaple(text) {
  const t = (text || "").toLowerCase();
  const staples = staplesText().split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return staples.some(s => t === s || t.includes(" " + s) || t.startsWith(s + " ") || t.startsWith(s + ","));
}

function weekNumber(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}

let datesFn = () => [];
export const setDatesSource = fn => { datesFn = fn; };
const allDatesBetween = (a, b) => datesFn().filter(x => x.date >= a && x.date <= b);

// Remembers postponed due dates and purchases (the base for "Moved too often" and "Restock").
function bookkeepingNow() {
  let changed = false;
  for (const t of db.all("tasks")) {
    if (isOn(t, "done") || !t.due) continue;
    if (!t.seenDue) { t.seenDue = t.due; changed = true; }
    else if (t.due > t.seenDue) { t.postponed = (t.postponed || 0) + 1; t.seenDue = t.due; changed = true; }
    else if (t.due < t.seenDue) { t.seenDue = t.due; changed = true; }
  }
  if (changed) db.save("tasks");
  const seen = marks();
  let bought = false;
  for (const s of db.all("shopping")) {
    if (!s.done || !s.item || seen.has("buy:" + s.id)) continue;
    const item = s.item.trim().toLowerCase();
    let log = db.all("buylog").find(r => r.item === item);
    if (!log) { log = { id: db.newId(), created: db.stamp(), item, name: s.item.trim(), dates: [] }; db.all("buylog").push(log); }
    log.dates.push(F.todayIso());
    if (s.store) log.store = s.store;
    if (num(s, "price") > 0) { log.price = num(s, "price"); log.priceDate = F.todayIso(); }   // for what recipes cost
    log.updated = db.stamp();
    db.all("automarks").push({ id: db.newId(), key: "buy:" + s.id, date: F.todayIso() });
    bought = true;
  }
  if (bought) { db.save("buylog"); db.save("automarks"); }
}

// Where this month ends: so far + still to come (booked for later / repeating not booked yet) + everyday spending.
export function forecast() {
  const t = F.today();
  const y = t.getFullYear(), m = t.getMonth();
  const end = new Date(y, m + 1, 0);
  const fixedCats = new Set(db.all("repeats").map(r => (r.category || "").toLowerCase()));
  let soFar = 0, coming = 0, everyday = 0;
  for (const x of db.all("transactions")) {
    const day = d(x, "date");
    if (!day || day.getFullYear() !== y || day.getMonth() !== m) continue;
    const a = num(x, "amount");
    if (day > t) { coming += a; continue; }
    soFar += a;
    if (a < 0 && a > -150 && !x.repeat && !fixedCats.has((x.category || "").toLowerCase()) && !notEveryday(x)) everyday -= a;
  }
  const key = F.monthKey(t);
  // (one you booked yourself this month, before its day, is already in "now" - not counted twice)
  for (const r of db.all("repeats")) if (!isOn(r, "paused") && (r.lastAdded || "") < key && !bookedByHand(r, key)) coming += num(r, "amount");
  const rest = -(everyday / Math.max(1, t.getDate())) * F.daysBetween(t, end);
  // month end = what you have now (carried over) + what's still to come + usual everyday spending
  const now = db.all("transactions").filter(x => x.date && x.date <= F.iso(t)).reduce((a, x) => a + num(x, "amount"), 0);
  return { soFar, coming, rest, now, end: now + coming + rest };
}
