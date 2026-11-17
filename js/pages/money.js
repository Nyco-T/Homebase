// Money: the month at a glance, a quick entry, where it went, every entry by day, and repeating entries.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, btn, seg, toast, empty, section } from "../ui.js";
import { d, num, isOn, guessCategory, addMissingRepeats, names } from "../kinds.js";
import { editRecord, newRecord } from "../form.js";
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

function entries(root) {
  const t = F.today();
  const y = month.getFullYear(), m = month.getMonth();
  const current = y === t.getFullYear() && m === t.getMonth();
  root.append(h("div.head", { style: { margin: "0 0 10px" } },
    h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { month = new Date(y, m - 1, 1); catFilter = null; go("money"); } }),
    h("div.serif", { style: { flex: "1", textAlign: "center", fontSize: "20px" } }, F.monthName(y, m)),
    h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { month = new Date(y, m + 1, 1); catFilter = null; go("money"); } }),
    current ? null : btn("Now", { small: true, onclick: () => { month = new Date(t.getFullYear(), t.getMonth(), 1); go("money"); } })));

  const inMonth = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd.getFullYear() === y && dd.getMonth() === m; });
  const inc = inMonth.map(x => num(x, "amount")).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const out = -inMonth.map(x => num(x, "amount")).filter(v => v < 0).reduce((a, b) => a + b, 0);
  root.append(h("div.stats",
    h("div.stat", h("div.caps", "Income"), h("div.v.serif.greenc", F.money(inc))),
    h("div.stat", h("div.caps", "Expenses"), h("div.v.serif", F.money(out))),
    h("div.stat", h("div.caps", "Balance"), h("div.v.serif" + (inc - out < 0 ? ".red" : ""), F.signedMoney(inc - out)))));
  if (current && db.all("transactions").length) {
    const f = forecast();
    root.append(h("div.small" + (f.end < 0 ? ".red" : ".muted"), { style: { margin: "-4px 2px 12px" } },
      "Month end ≈ " + F.signedMoney(f.end) + " · still to come " + F.signedMoney(f.coming) + (f.rest ? " · everyday ≈ " + F.signedMoney(f.rest) : "")));
  }

  root.append(quickEntry());

  // where it went
  const cats = {};
  for (const x of inMonth) if (num(x, "amount") < 0) cats[x.category || "Other"] = (cats[x.category || "Other"] || 0) - num(x, "amount");
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (top.length) {
    const c = h("div.card", h("div.cardhead", h("h2", "Where it went"), catFilter ? btn("Show all", { kind: "ghost", small: true, onclick: () => { catFilter = null; go("money"); } }) : null));
    const max = top[0][1];
    for (const [name, v] of top.slice(0, 7)) {
      c.append(h("div", { style: { padding: "6px 0", opacity: catFilter && catFilter !== name ? ".45" : "1" }, onclick: () => { catFilter = catFilter === name ? null : name; go("money"); } },
        h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "4px" } }, h("span", name), h("span.muted", F.money(v) + " · " + F.percent(v / out))),
        h("div.bar", h("span", { style: { width: Math.max(3, v / max * 100) + "%" } }))));
    }
    root.append(c);
  }

  // every entry, by day
  const shown = inMonth.filter(x => !catFilter || (x.category || "Other") === catFilter).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  if (!shown.length) { root.append(empty("No entries in " + F.monthName(y, m) + " yet.")); return; }
  const byDay = {};
  for (const x of shown) (byDay[x.date] = byDay[x.date] || []).push(x);
  for (const [day, list] of Object.entries(byDay)) {
    const dd = F.parseIso(day);
    const total = list.reduce((a, x) => a + num(x, "amount"), 0);
    root.append(section((dd.getTime() === t.getTime() ? "Today · " : "") + F.dayDate(dd), F.signedMoney(total)));
    root.append(h("div.list", list.map(x => {
      const a = num(x, "amount");
      return h("div.row", { onclick: () => editRecord("transactions", x) },
        h("span.tile", { style: { background: "var(--card2)", color: "var(--muted)", fontWeight: "700", fontSize: "14px" } }, (x.category || "?").slice(0, 1).toUpperCase()),
        h("div.grow", h("div.title", x.description || "–"), h("div.meta", (x.category || "Other") + (x.repeat ? " · repeating" : ""))),
        h("span.right" + (a > 0 ? ".greenc" : ""), F.signedMoney(a)));
    })));
  }
}

function quickEntry() {
  const amount = h("input.field", { inputmode: "decimal", placeholder: "0,00", style: { flex: "0 0 100px" } });
  const what = h("input.field", { placeholder: income ? "Salary, gift …" : "What for?" });
  const listId = "money-cats";
  const cat = h("input.field", { list: listId, placeholder: "Category" });
  let picked = false;
  cat.addEventListener("input", () => { picked = !!cat.value; });
  what.addEventListener("input", () => { if (!picked) cat.value = what.value ? guessCategory(what.value).replace(/^Other$/, "") : ""; });
  const toggle = h("div.seg", { style: { marginBottom: "8px" } },
    h("button" + (!income ? ".on" : ""), { onclick: () => { income = false; go("money"); } }, "Expense"),
    h("button" + (income ? ".on" : ""), { onclick: () => { income = true; go("money"); } }, "Income"));
  const add = () => {
    const v = F.parseNumber(amount.value);
    if (v == null || v <= 0) { amount.focus(); toast("Type the amount first"); return; }
    const desc = what.value.trim() || (income ? "Income" : "Expense");
    const c = cat.value.trim() || guessCategory(desc).replace(/^Other$/, income ? "Income" : "Other");
    db.add("transactions", { description: desc, amount: income ? v : -v, category: c, date: F.todayIso() });
    toast((income ? "Income " : "Expense ") + F.money(v) + " · " + desc, "Undo", () => { const list = db.all("transactions"); const r = list[list.length - 1]; if (r && r.description === desc) db.remove("transactions", r); });
  };
  for (const el of [amount, what, cat]) el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  return h("div.card", toggle,
    h("div", { style: { display: "flex", gap: "8px", marginBottom: "8px" } }, amount, what),
    h("div", { style: { display: "flex", gap: "8px" } }, cat, btn("Add", { kind: "primary", onclick: add })),
    h("datalist", { id: listId }, names("transactions", "category").map(c => h("option", { value: c }))));
}

function repeats(root) {
  const rules = db.all("repeats").slice().sort((a, b) => (num(a, "day") || 1) - (num(b, "day") || 1));
  root.append(h("div.sub", "Rent, salary, subscriptions - booked into Money by themselves every month."));
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
