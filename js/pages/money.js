// Money: the balance big on top, where it went, every entry by day (+ adds one), and repeating entries.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, btn, seg, toast, empty, section, sheet, dialog, ask } from "../ui.js";
import { d, num, isOn, guessCategory, addMissingRepeats, names, splitEntry, isCorrection, balanceOn, setBalance, waitingRepeats, waitQuestion, confirmRepeat, undoRepeat, notYetRepeat } from "../kinds.js";
import { editRecord, newRecord, calcField } from "../form.js";
import { forecast } from "../rules.js";
import { go } from "../app.js";

let month = null;
let income = false;
let catFilter = null;

export function render(root, sub) {
  const t = F.today();
  month = month || new Date(t.getFullYear(), t.getMonth(), 1);
  root.append(h("div.head", h("h1.serif", "Money")));
  root.append(seg(["Entries", "Repeating"], sub === "repeats" ? 1 : 0, i => go(i ? "money/repeats" : "money")));
  if (sub === "repeats") repeats(root); else entries(root);
}

let allCats = false;
let showTotals = false;

function entries(root) {
  const t = F.today();
  const y = month.getFullYear(), m = month.getMonth();
  const current = y === t.getFullYear() && m === t.getMonth();
  // an entry booked for a later day (the salary on the 28th) only shows from that day on
  const inMonth = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd.getFullYear() === y && dd.getMonth() === m && dd <= t; });
  // a balance correction only fixes the balance - it's not income or spending
  const real = inMonth.filter(x => !isCorrection(x));
  const inc = real.map(x => num(x, "amount")).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const out = -real.map(x => num(x, "amount")).filter(v => v < 0).reduce((a, b) => a + b, 0);
  // the total you have, carried over from earlier months (up to today, or the end of an earlier month)
  const monthEnd = new Date(y, m + 1, 0);
  const upTo = monthEnd < t ? monthEnd : t;
  const bal = balanceOn(upTo);

  // the month and its balance - big, one glance
  const hero = h("div.card", { style: { padding: "12px 16px 14px" } },
    h("div", { style: { display: "flex", alignItems: "center", marginBottom: "6px" } },
      h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { month = new Date(y, m - 1, 1); catFilter = null; go("money"); } }),
      h("div.caps", { style: { flex: "1", textAlign: "center" } }, F.monthName(y, m)),
      h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { month = new Date(y, m + 1, 1); catFilter = null; go("money"); } })),
    h("div.caps", { style: { textAlign: "center" } }, current ? "Balance · you have" : "Balance on " + F.date(upTo)),
    h("div.serif" + (bal < 0 ? ".red" : ""), { style: { fontSize: "38px", textAlign: "center", margin: "2px 0 0" }, onclick: askBalance }, F.signedMoney(bal)),
    h("div.small.faint", { style: { textAlign: "center", marginBottom: "10px" }, onclick: askBalance }, "tap to set"),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", textAlign: "center" } },
      h("div", h("div.caps", "Income"), h("div.serif.greenc", { style: { fontSize: "19px" } }, F.money(inc))),
      h("div", h("div.caps", "Expenses"), h("div.serif.red", { style: { fontSize: "19px" } }, F.money(out)))),
    totalsBlock(),
    current && db.all("transactions").length ? (() => { const f = forecast(); return h("div.small" + (f.end < 0 ? ".red" : ".muted"), { style: { textAlign: "center", marginTop: "10px" } }, "Month end ≈ " + F.signedMoney(f.end)); })() : null,
    current ? null : h("div", { style: { textAlign: "center", marginTop: "8px" } }, btn("Back to " + F.monthName(t.getFullYear(), t.getMonth()), { kind: "ghost", small: true, onclick: () => { month = new Date(t.getFullYear(), t.getMonth(), 1); go("money"); } })));
  root.append(hero);
  if (current) { const w = waitingBlock(); if (w) root.append(w); const f = favouritesRow(); if (f) root.append(f); }

  // where it went: the top 3, the rest on tap
  const cats = {};
  for (const x of real) if (num(x, "amount") < 0) cats[x.category || "Other"] = (cats[x.category || "Other"] || 0) - num(x, "amount");
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (top.length) {
    const c = h("div.card", h("div.cardhead", h("h2", "Where it went"), catFilter ? btn("Show all", { kind: "ghost", small: true, onclick: () => { catFilter = null; go("money"); } }) : null));
    const max = top[0][1];
    for (const [name, v] of top.slice(0, allCats ? top.length : 3)) {
      c.append(h("div", { style: { padding: "5px 0", opacity: catFilter && catFilter !== name ? ".45" : "1" }, onclick: () => { catFilter = catFilter === name ? null : name; go("money"); } },
        h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "14.5px", marginBottom: "4px" } }, h("span", name), h("span.muted", F.money(v))),
        h("div.bar", h("span", { style: { width: Math.max(3, v / max * 100) + "%", background: "var(--red)", opacity: ".75" } }))));
    }
    if (top.length > 3) c.append(h("button.btn.ghost.small", { style: { marginTop: "4px" }, onclick: () => { allCats = !allCats; go("money"); } }, allCats ? "Show less" : "+ " + (top.length - 3) + " more categories"));
    root.append(c);
  }

  // every entry, by day
  // corrections only fix the balance - they aren't listed
  const shown = inMonth.filter(x => !isCorrection(x) && (!catFilter || (x.category || "Other") === catFilter)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  if (!shown.length) root.append(empty("No entries in " + F.monthName(y, m) + " yet. Tap + to add one."));
  const byDay = {};
  for (const x of shown) (byDay[x.date] = byDay[x.date] || []).push(x);
  for (const [day, list] of Object.entries(byDay)) {
    const dd = F.parseIso(day);
    const total = list.reduce((a, x) => a + num(x, "amount"), 0);
    root.append(section((dd.getTime() === t.getTime() ? "Today · " : "") + F.dayDate(dd), F.signedMoney(total)));
    root.append(h("div.list", list.map(x => {
      const a = num(x, "amount");
      return h("div.row", { onclick: () => openEntry(x) },
        h("div.grow", h("div.title", x.description || "–"), h("div.meta", (x.category || "Other") + (x.repeat ? " · repeating" : ""))),
        h("span.right" + (a > 0 ? ".greenc" : ""), F.signedMoney(a)));
    })));
  }
  root.append(h("button.fab", { "aria-label": "New entry", html: icon("plus", 26), onclick: () => entrySheet() }));
}

// Income and expenses start fresh each month; this button shows them over all time (corrections left out).
function totalsBlock() {
  const t = F.today();
  const all = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd <= t && !isCorrection(x); });
  const inc = all.map(x => num(x, "amount")).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const out = -all.map(x => num(x, "amount")).filter(v => v < 0).reduce((a, b) => a + b, 0);
  const box = h("div", { style: { textAlign: "center", marginTop: "10px" } },
    btn(showTotals ? "Hide totals" : "Show totals", { kind: "ghost", small: true, onclick: () => { showTotals = !showTotals; go("money"); } }));
  if (showTotals) {
    const first = all.map(x => x.date).sort()[0];
    box.append(h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "6px" } },
      h("div", h("div.caps", "Income total"), h("div.serif.greenc", { style: { fontSize: "17px" } }, F.money(inc))),
      h("div", h("div.caps", "Expenses total"), h("div.serif.red", { style: { fontSize: "17px" } }, F.money(out)))),
      first ? h("div.small.faint", { style: { marginTop: "4px" } }, "since " + F.date(F.parseIso(first))) : null);
  }
  return box;
}

// "Set balance": type what's in your account, the difference becomes a correction (not income or spending).
async function askBalance() {
  const now = balanceOn(F.today());
  const answer = await ask("Set balance", "What's in your account right now?", now.toFixed(2).replace(".", ","), "text");
  const v = F.parseAmount(answer);
  if (v == null) return;
  const diff = setBalance(v);
  toast(diff === 0 ? "Balance already " + F.money(v) : "Balance set to " + F.money(v) + " (correction " + F.signedMoney(diff) + ")");
}

function openEntry(x) {
  const actions = num(x, "amount") < 0 ? [{ label: "Split", icon: "repeat", run: splitDialog }] : [];
  editRecord("transactions", x, { actions });
}

// You paid for someone: who, and how much do they owe you? (half by default)
async function splitDialog(entry) {
  const total = Math.abs(num(entry, "amount"));
  const who = h("input.field", { placeholder: "Name", list: "split-people" });
  const amount = h("input.field", { inputmode: "decimal", value: (total / 2).toFixed(2).replace(".", ",") });
  const people = [...new Set(db.all("tasks").filter(t => t.refundFrom).map(t => t.refundFrom))];
  const body = h("div", h("div.muted.small", (entry.description || "") + " · you paid " + F.money(total)),
    h("label", h("span.label.caps", "Who owes you"), who), h("label", h("span.label.caps", "How much"), calcField(amount)),
    h("datalist", { id: "split-people" }, people.map(p => h("option", { value: p }))),
    h("div.small.faint", { style: { marginTop: "8px" } }, "You get a task \"Get … back\". Tick it when the money is there - it's booked into Money by itself."));
  const ok = await dialog("Split " + (entry.description || "entry"), body, [{ label: "Cancel", value: false }, { label: "Split", value: true, main: true }]);
  if (!ok) return;
  const v = F.parseAmount(amount.value);
  if (!who.value.trim() || v == null || v <= 0) { toast("Name and amount, please"); return; }
  splitEntry(entry, who.value.trim(), v);
  toast("Task: get " + F.money(v) + " back from " + who.value.trim());
}

// The entries you book most (last 90 days, at least twice) - one tap books them again. Same amount each time
// (Mensa 4,50) -> booked right away; changing amounts (REWE) -> the entry sheet opens with it filled in.
// Automation: learned from your entries by itself, nothing to set up.
export function favourites(max = 6) {
  const today = F.todayIso();
  const since = F.iso(F.addDays(F.today(), -90));
  const groups = new Map();
  for (const x of db.all("transactions")) {
    if (!x.date || x.date < since || x.date > today || x.repeat || isCorrection(x) || /paid back/i.test(x.category || "")) continue;
    const key = (x.description || "").trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(x);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
    const last = list.slice(0, 3).map(x => num(x, "amount"));
    out.push({ description: list[0].description.trim(), category: list[0].category || "", amount: last[0], fixed: last.every(a => Math.abs(a - last[0]) < 0.005),
      count: list.length, lastDate: list[0].date });
  }
  return out.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)).slice(0, max);
}

const favLabel = f => f.description + " " + (f.fixed ? F.money(Math.abs(f.amount)) : "…");

function bookFavourite(f) {
  if (!f.fixed) return entrySheet(f);
  const e = db.add("transactions", { description: f.description, amount: f.amount, category: f.category || guessCategory(f.description), date: F.todayIso() });
  toast((f.amount > 0 ? "Income " : "Expense ") + F.money(Math.abs(f.amount)) + " · " + f.description, "Undo", () => db.remove("transactions", e));
}

// "Quick add" row on the Money page.
function favouritesRow() {
  const favs = favourites();
  if (!favs.length) return null;
  return h("div", section("Quick add", "one tap books it today"),
    h("div.chips", { style: { flexWrap: "wrap" } }, favs.map(f => h("button.chip", { onclick: () => bookFavourite(f) },
      h("span" + (f.amount > 0 ? ".greenc" : ""), favLabel(f))))));
}

// New entry in a sheet: Expense / Income, amount, what, category (guessed), date. preset = a favourite to fill in.
function entrySheet(preset) {
  let isIncome = preset && preset.amount != null ? preset.amount > 0 : income;
  const amount = h("input.field", { inputmode: "decimal", placeholder: "0,00", style: { fontSize: "28px", textAlign: "center", padding: "12px" } });
  const what = h("input.field", { placeholder: "What for?" });
  const cat = h("input.field", { list: "money-cats", placeholder: "Category" });
  const day = h("input.field", { type: "date", value: F.todayIso() });
  let picked = false;
  const fill = f => {
    what.value = f.description; cat.value = f.category || ""; picked = !!cat.value;
    isIncome = f.amount > 0; drawToggle();
    amount.value = f.fixed ? F.plainAmount(Math.abs(f.amount)) : "";
    amount.dispatchEvent(new Event("input"));
    setTimeout(() => amount.focus(), 50);
  };
  cat.addEventListener("input", () => { picked = !!cat.value; });
  what.addEventListener("input", () => { if (!picked) cat.value = what.value ? guessCategory(what.value).replace(/^Other$/, "") : ""; });
  const toggle = h("div.seg");
  const drawToggle = () => {
    toggle.innerHTML = "";
    toggle.append(h("button" + (!isIncome ? ".on" : ""), { onclick: () => { isIncome = false; drawToggle(); } }, "Expense"),
      h("button" + (isIncome ? ".on" : ""), { onclick: () => { isIncome = true; drawToggle(); } }, "Income"));
  };
  drawToggle();
  const favs = favourites(8);
  const favBox = favs.length && !preset ? h("div.chips", { style: { flexWrap: "wrap", marginTop: "8px" } },
    favs.map(f => h("button.chip", { type: "button", onclick: () => fill(f) }, favLabel(f)))) : null;
  const add = () => {
    const v = F.parseAmount(amount.value);
    if (v == null || v <= 0) { amount.focus(); toast("Type the amount first"); return; }
    const desc = what.value.trim() || (isIncome ? "Income" : "Expense");
    const c = cat.value.trim() || guessCategory(desc).replace(/^Other$/, isIncome ? "Income" : "Other");
    const e = db.add("transactions", { description: desc, amount: isIncome ? v : -v, category: c, date: day.value || F.todayIso() });
    income = isIncome;
    s.close();
    toast((isIncome ? "Income " : "Expense ") + F.money(v) + " · " + desc, "Undo", () => db.remove("transactions", e));
  };
  for (const el of [amount, what, cat]) el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  const s = sheet("New entry", h("div", toggle, favBox, calcField(amount),
    h("label", h("span.label.caps", "What for"), what),
    h("div.grid2", h("label", h("span.label.caps", "Category"), cat), h("label", h("span.label.caps", "Date"), day)),
    h("datalist", { id: "money-cats" }, names("transactions", "category").map(c => h("option", { value: c })))), {
    actions: [btn("Cancel", { kind: "ghost", onclick: () => s.close() }), btn("Add", { kind: "primary", icon: "plus", onclick: add })]
  });
  if (preset) setTimeout(() => fill(preset), 0); else setTimeout(() => amount.focus(), 250);
}

function repeats(root) {
  const rules = db.all("repeats").slice().sort((a, b) => (num(a, "day") || 1) - (num(b, "day") || 1));
  root.append(h("div.sub", "Rent, salary, subscriptions - on their day Homebase asks if they came / were paid, then books them (Automation → Money to book them without asking)."));
  if (!rules.length) root.append(empty("Nothing repeating yet. Tap + to add your rent or salary."));
  else {
    const monthly = rules.filter(r => !isOn(r, "paused")).reduce((a, r) => a + num(r, "amount"), 0);
    root.append(h("div.stats", { style: { gridTemplateColumns: "1fr 1fr" } },
      h("div.stat", h("div.caps", "Every month"), h("div.v.serif" + (monthly < 0 ? "" : ".greenc"), F.signedMoney(monthly))),
      h("div.stat", h("div.caps", "Active"), h("div.v.serif", String(rules.filter(r => !isOn(r, "paused")).length)))));
    root.append(h("div.list", rules.map(r => {
      const a = num(r, "amount");
      return h("div.row", { onclick: () => editRecord("repeats", r) },
        tile("repeat", a > 0 ? "--money" : "--home"),
        h("div.grow", h("div.title" + (isOn(r, "paused") ? ".done" : ""), r.description || "–"), h("div.meta", (r.category || "") + " · day " + (num(r, "day") || 1) + (isOn(r, "paused") ? " · paused" : ""))),
        h("span.right" + (a > 0 ? ".greenc" : ""), F.signedMoney(a)));
    })));
  }
  root.append(h("button.fab", { "aria-label": "New", html: icon("plus", 26), onclick: () => {
    const s = newRecord("repeats");
    const t = F.today();
    // the first month counts from now on
    const r = db.all("repeats")[db.all("repeats").length - 1];
    if (r) r.lastAdded = F.monthKey(new Date(t.getFullYear(), t.getMonth() - 1, 1));
    return s;
  } }));
  addMissingRepeats();
}

// ---------------- "Did your salary arrive?" ----------------

function answered(w, done) {
  toast("Booked: " + w.rule.description + " " + F.signedMoney(num(done.e, "amount")), "Undo", () => undoRepeat(w, done));
}

// The question with the amount to change (salary a bit different this month?). Opened from a row or the bell.
export async function askRepeat(w) {
  const input = h("input.field", { inputmode: "decimal", value: F.number(num(w.rule, "amount")), style: { marginTop: "10px" } });
  const body = h("div", h("div.muted", (w.late ? "It wasn't there on " : "Due on ") + F.date(w.day) + ". Booked " + (w.late ? "today" : "on " + F.shortDate(w.day)) + " - change the amount if it was different."), input);
  const r = await dialog(waitQuestion(w), body, [{ label: "Not yet", value: "no" }, { label: "Yes, book it", value: "yes", main: true }]);
  if (r === "no") { notYetRepeat(w); toast("OK - Homebase asks again tomorrow"); }
  if (r === "yes") {
    const a = F.parseAmount(input.value);
    answered(w, confirmRepeat(w, a == null ? undefined : a));
  }
}

// The open questions as a card (Money page and Home). null when nothing waits.
export function waitingBlock() {
  const open = waitingRepeats().filter(w => !w.askedToday);
  if (!open.length) return null;
  return h("div.card", h("div.caps", { style: { marginBottom: "6px" } }, "Waiting for your yes"),
    ...open.map(w => {
      const a = num(w.rule, "amount");
      return h("div.row", { onclick: () => askRepeat(w) }, tile("repeat", a > 0 ? "--money" : "--home"),
        h("div.grow", h("div.title", { style: { whiteSpace: "normal" } }, waitQuestion(w)), h("div.meta", F.signedMoney(a) + " · " + (w.late ? "not there on " : "due ") + F.shortDate(w.day))),
        h("div", { style: { display: "flex", gap: "4px" } },
          btn("Yes", { kind: "soft", small: true, onclick: e => { e.stopPropagation(); answered(w, confirmRepeat(w)); } }),
          btn("Not yet", { kind: "ghost", small: true, onclick: e => { e.stopPropagation(); notYetRepeat(w); toast("OK - Homebase asks again tomorrow"); } })));
    }));
}
