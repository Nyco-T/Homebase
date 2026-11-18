// Quick add - one line for everything (English or German):
//   "12,50 lunch #Food"  "+2000 salary"          -> Money (expense / income)
//   "todo call mum fri"  "aufgabe Mama anrufen fr" -> task (last word can be a day)
//   "buy milk, eggs"     "kaufe Milch, Eier"        -> shopping list
//   "note …" "notiz …"  "idea …" "idee …"          -> notes
//   "event dentist 24.11."  "termin Zahnarzt mo"    -> calendar
//   "birthday Anna 22.11."  "geburtstag Anna 22.11." -> yearly birthday in the calendar
// Returns what was added, or null when it didn't understand the line.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { book, guessCategory } from "./kinds.js";

function lastWordDate(rest) {
  const words = rest.trim().split(/\s+/);
  if (words.length < 2) return { text: rest.trim(), date: null };
  const d = F.parseDate(words[words.length - 1]);
  return d ? { text: words.slice(0, -1).join(" "), date: d } : { text: rest.trim(), date: null };
}

function startsWith(lower, words) {
  for (const w of words) if (lower.startsWith(w + " ")) return w.length + 1;
  return 0;
}

export function quickAdd(line) {
  const s = (line || "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  const money = s.match(/^([+-]?)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)?\s+(.+)$/i);
  if (money) {
    const amount = F.parseNumber(money[2]);
    const income = money[1] === "+";
    let rest = money[3].trim();
    let category = null;
    const tag = rest.match(/#(\S+)/);
    if (tag) { category = tag[1]; rest = rest.replace(tag[0], "").trim(); }
    if (!category) category = guessCategory(rest);
    if (income && category === "Other") category = "Income";
    book(rest, income ? amount : -amount, category, F.todayIso());
    return (income ? "Income " : "Expense ") + F.money(amount) + " · " + rest + " · " + category;
  }

  let n = startsWith(lower, ["todo", "task", "to do", "aufgabe"]);
  if (n) {
    let rest = s.slice(n);
    const high = /(^|\s)!(\s|$)/.test(rest);
    rest = rest.replace(/(^|\s)!(\s|$)/, " ").trim();
    let list = null;
    const tag = rest.match(/#(\S+)/);
    if (tag) { list = tag[1]; rest = rest.replace(tag[0], "").trim(); }
    // a time anywhere: "9:00", "18.30", "9 uhr", "um 9", "at 18:30"
    let time = null;
    const tm = rest.match(/(?:^|\s)(?:um\s+|at\s+)?(\d{1,2})(?:[:.](\d{2})|\s*uhr|\s*h\b)(?=\s|$)/i) || rest.match(/(?:^|\s)(?:um|at)\s+(\d{1,2})(?=\s|$)/i);
    if (tm && +tm[1] < 24 && (!tm[2] || +tm[2] < 60)) { time = String(tm[1]).padStart(2, "0") + ":" + (tm[2] || "00"); rest = rest.replace(tm[0], " ").replace(/\s+/g, " ").trim(); }
    const { text, date } = lastWordDate(rest);
    const t = { title: text, priority: high ? "High" : "Normal", repeat: "Never", done: false };
    if (date) t.due = F.iso(date);
    else if (time) t.due = F.todayIso();   // a time without a day means today
    if (time) t.time = time;
    if (list) t.list = list;
    db.add("tasks", t);
    return "Task: " + text + (t.due ? " · due " + F.relative(F.parseIso(t.due)) + (time ? " " + time : "") : "");
  }

  n = startsWith(lower, ["buy", "kaufe", "kaufen", "einkaufen"]);
  if (n) {
    const items = s.slice(n).split(/,| and | und /).map(x => x.trim()).filter(Boolean);
    for (const item of items) {
      const q = item.match(/^(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|x|stück|pack)?)\s+(.+)$/i);
      db.add("shopping", q ? { item: q[2], qty: q[1], done: false } : { item, done: false });
    }
    return "Shopping list: " + F.plural(items.length, "item", "items");
  }

  n = startsWith(lower, ["note", "notiz"]);
  if (n) {
    const rest = s.slice(n).trim();
    db.add("notes", { title: rest.length > 50 ? rest.slice(0, 50) + "…" : rest, body: rest });
    return "Note saved";
  }

  n = startsWith(lower, ["idea", "idee"]);
  if (n) {
    const rest = s.slice(n).trim();
    db.add("notes", { title: rest.length > 50 ? rest.slice(0, 50) + "…" : rest, body: rest, tags: ["idea"] });
    return "Idea saved to your notes";
  }

  n = startsWith(lower, ["birthday", "geburtstag"]);
  if (n) {
    const { text, date } = lastWordDate(s.slice(n));
    if (!date) return null;
    db.add("events", { title: text + "'s birthday", date: F.iso(date), repeat: "Yearly", category: "Birthday" });
    return "Birthday: " + text + " · every " + F.shortDate(date);
  }

  n = startsWith(lower, ["event", "termin"]);
  if (n) {
    const { text, date } = lastWordDate(s.slice(n));
    const day = date || F.today();
    db.add("events", { title: text, date: F.iso(day), repeat: "Never" });
    return "Event: " + text + " · " + F.dayDate(day);
  }

  return null;
}

export const QUICK_HINT = "12,50 lunch · todo call mum fri · buy milk, eggs";
