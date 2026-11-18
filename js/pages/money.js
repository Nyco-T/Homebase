// Money: the balance big on top, where it went, every entry by day (+ adds one), and repeating entries.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, btn, seg, toast, empty, section, sheet, dialog, ask } from "../ui.js";
import { d, num, isOn, guessCategory, addMissingRepeats, names, splitEntry, isCorrection, isNeutral, isTransfer, balanceOn, setBalance, waitingRepeats, waitQuestion, confirmRepeat, undoRepeat, notYetRepeat, accounts, accountOf, accountIcon, moveMoney, transferPair, guessAccount } from "../kinds.js";
import { editRecord, newRecord, calcField, choiceChips, usedMost } from "../form.js";
import { forecast } from "../rules.js";
import { catStyle } from "../cats.js";
import { go } from "../app.js";

let month = null;
let income = false;
let catFilter = null;
let acct = null;   // null = all accounts
let showEarlier = false, earlierFor = "";
let lastFront;   // the card in front last time - it only slides in when that changes   // the folded older days of the entry list

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
  const inMonth = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd.getFullYear() === y && dd.getMonth() === m && dd <= t && (!acct || accountOf(x) === acct); });
  // a balance correction or a cash withdrawal only moves money around - it's not income or spending
  const real = inMonth.filter(x => !isNeutral(x));
  const inc = real.map(x => num(x, "amount")).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const out = -real.map(x => num(x, "amount")).filter(v => v < 0).reduce((a, b) => a + b, 0);
  // the total you have, carried over from earlier months (up to today, or the end of an earlier month)
  const monthEnd = new Date(y, m + 1, 0);
  const upTo = monthEnd < t ? monthEnd : t;

  // your accounts as wallet cards (All in front by default) - the balance lives on the card
  root.append(...walletStack(t, upTo, current));

  // the month: income and expenses (of the card in front), totals, month end
  const hero = h("div.card", { style: { padding: "10px 16px 14px" } },
    h("div", { style: { display: "flex", alignItems: "center", marginBottom: "8px" } },
      h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { month = new Date(y, m - 1, 1); catFilter = null; go("money"); } }),
      h("div.caps", { style: { flex: "1", textAlign: "center" } }, F.monthName(y, m) + (acct ? " · " + acct : "")),
      h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { month = new Date(y, m + 1, 1); catFilter = null; go("money"); } })),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", textAlign: "center" } },
      h("div", h("div.caps", "Income"), h("div.serif.greenc", { style: { fontSize: "19px" } }, F.money(inc))),
      h("div", h("div.caps", "Expenses"), h("div.serif.red", { style: { fontSize: "19px" } }, F.money(out)))),
    totalsBlock(),
    current ? h("div", { style: { textAlign: "center", marginTop: "6px" } }, btn(acct === "Cash" ? "Count cash" : "Move money", { kind: "ghost", small: true, icon: acct === "Cash" ? "wallet" : "repeat",
      onclick: () => acct === "Cash" ? askBalance("Cash") : moveDialog() })) : null,
    current && !acct && db.all("transactions").length ? (() => { const f = forecast(); return h("div.small" + (f.end < 0 ? ".red" : ".muted"), { style: { textAlign: "center", marginTop: "10px" } }, "Month end ≈ " + F.signedMoney(f.end)); })() : null,
    current ? null : h("div", { style: { textAlign: "center", marginTop: "8px" } }, btn("Back to " + F.monthName(t.getFullYear(), t.getMonth()), { kind: "ghost", small: true, onclick: () => { month = new Date(t.getFullYear(), t.getMonth(), 1); go("money"); } })));
  // swipe the month box left / right for the next / previous month; dots show where you are (last 6 months)
  const dots = h("div.mdots");
  for (let k = 5; k >= 0; k--) {
    const mk = new Date(t.getFullYear(), t.getMonth() - k, 1);
    dots.append(h("i" + (mk.getFullYear() === y && mk.getMonth() === m ? ".on" : "")));
  }
  hero.append(dots);
  let sx = null, sy = null;
  hero.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; sideways = null; }, { passive: true });
  let sideways = null;   // decided once per touch: clearly sideways (follow the finger) or not (stay still while you scroll)
  hero.addEventListener("touchmove", e => {
    if (sx == null) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (sideways === null && Math.abs(dx) + Math.abs(dy) > 12) sideways = Math.abs(dx) > Math.abs(dy) * 2;
    if (sideways) hero.style.transform = "translateX(" + dx / 3 + "px)";
  }, { passive: true });
  hero.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    const wasSideways = sideways;
    sx = null; sideways = null; hero.style.transform = "";
    if (!wasSideways || Math.abs(dx) < 50) return;
    month = new Date(y, m + (dx < 0 ? 1 : -1), 1); catFilter = null; go("money");
  }, { passive: true });
  root.append(hero);
  if (current) { const w = waitingBlock(); if (w) root.append(w); const f = favouritesRow(); if (f) root.append(f); }

  // where it went: a ring with the categories in their colours, the list next to it - tap one to see only its entries
  const cats = {};
  for (const x of real) if (num(x, "amount") < 0) cats[x.category || "Other"] = (cats[x.category || "Other"] || 0) - num(x, "amount");
  const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  if (top.length) {
    const c = h("div.card", h("div.cardhead", h("h2", "Where it went"), catFilter ? btn("Show all", { kind: "ghost", small: true, onclick: () => { catFilter = null; go("money"); } }) : null));
    const shownCats = top.slice(0, allCats ? top.length : 4);
    const legend = h("div.legend", shownCats.map(([name, v]) => {
      const st = catStyle(name);
      return h("div.lrow" + (catFilter && catFilter !== name ? ".dim" : ""), { onclick: () => { catFilter = catFilter === name ? null : name; go("money"); } },
        h("span.ldot", { style: { background: st.color } }),
        h("span.lname", st.emoji + " " + name),
        h("span.lval", F.money(v)), h("span.lpct", Math.round(v / out * 100) + " %"));
    }));
    c.append(h("div.where", donut(top, out), legend));
    if (top.length > 4) c.append(h("button.btn.ghost.small", { style: { marginTop: "4px" }, onclick: () => { allCats = !allCats; go("money"); } }, allCats ? "Show less" : "+ " + (top.length - 4) + " more categories"));
    root.append(c);
  }

  // every entry, by day
  // corrections only fix the balance - they aren't listed
  // a transfer is two entries; in "All" only its "from" side is listed
  const shown = inMonth.filter(x => !isCorrection(x) && !(isTransfer(x) && !acct && num(x, "amount") > 0) && (!catFilter || (x.category || "Other") === catFilter)).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  if (!shown.length) root.append(empty("No entries in " + F.monthName(y, m) + " yet. Tap + to add one."));
  const byDay = {};
  for (const x of shown) (byDay[x.date] = byDay[x.date] || []).push(x);
  // the last week stays open (at least 3 days with entries); older days fold into "Show earlier days"
  if (earlierFor !== y + "-" + m + ":" + acct) { earlierFor = y + "-" + m + ":" + acct; showEarlier = false; }
  const days = Object.keys(byDay);
  const weekAgo = F.iso(F.addDays(upTo, -6));
  const openCount = catFilter ? days.length : Math.max(Math.min(3, days.length), days.filter(k => k >= weekAgo).length);
  const dayTotal = list => list.filter(x => acct || !isTransfer(x)).reduce((a, x) => a + num(x, "amount"), 0);
  const yesterday = F.addDays(t, -1).getTime();
  const dayBlock = day => {
    const dd = F.parseIso(day), list = byDay[day];
    const label = dd.getTime() === t.getTime() ? "Today · " : dd.getTime() === yesterday ? "Yesterday · " : "";
    const sec = section(label + F.dayDate(dd), F.signedMoney(dayTotal(list))), lst = entryList(list);
    if (dd.getTime() === t.getTime()) { sec.classList.add("today"); lst.classList.add("today"); }
    return [sec, lst];
  };
  for (const day of days.slice(0, openCount)) root.append(...dayBlock(day));
  const folded = days.slice(openCount);
  if (folded.length) {
    const sum = folded.reduce((a, k) => a + dayTotal(byDay[k]), 0);
    const toggle = h("button.fold", { onclick: () => { showEarlier = !showEarlier; go("money"); } },
      h("span", { html: icon(showEarlier ? "up" : "down", 18) + (showEarlier ? " Show fewer days" : " Show earlier days") }),
      showEarlier ? null : h("span.small.muted", F.plural(folded.length, "day", "days") + " · " + F.signedMoney(sum)));
    if (showEarlier) { for (const day of folded) root.append(...dayBlock(day)); }
    root.append(toggle);
  }
  root.append(h("button.fab", { "aria-label": "New entry", html: icon("plus", 26), onclick: () => entrySheet() }));
}

// The entries of one day (transfers as one line "Bank -> Cash").
function entryList(list) {
  {
    return h("div.list", list.map(x => {
      const a = num(x, "amount");
      if (isTransfer(x)) {
        const pair = transferPair(x);
        const from = accountOf(pair.find(p => num(p, "amount") < 0) || x), to = accountOf(pair.find(p => num(p, "amount") > 0) || x);
        return h("div.row", { onclick: () => openTransfer(x) }, h("span.tile.cat", { style: { background: "color-mix(in srgb, var(--blue) 22%, transparent)" } }, "↔️"),
          h("div.grow", h("div.title", x.description || "Transfer"), h("div.meta", accountIcon(from) + " " + from + " → " + accountIcon(to) + " " + to)),
          h("span.right.muted", acct ? F.signedMoney(a) : F.money(Math.abs(a))));
      }
      return h("div.row", { onclick: () => openEntry(x) }, catTile(x.category),
        h("div.grow", h("div.title", x.description || "–"), h("div.meta", (x.category || "Other") + (!acct && accountOf(x) !== "Bank" ? " · " + accountIcon(accountOf(x)) + " " + accountOf(x) : "") + (x.repeat ? " · repeating" : ""))),
        h("span.right" + (a > 0 ? ".greenc" : ""), F.signedMoney(a)));
    }));
  }
}

// A category's emoji in a soft circle of its colour.
function catTile(category) {
  const st = catStyle(category);
  return h("span.tile.cat", { style: { background: `color-mix(in srgb, ${st.color} 22%, transparent)` } }, st.emoji);
}

// The ring: one arc per category (small ones together as "Rest"), the month's spending in the middle.
function donut(top, total) {
  const R = 46, C = 2 * Math.PI * R, GAP = top.length > 1 ? 2 : 0;
  const parts = top.slice(0, 6);
  if (top.length > 6) parts.push(["Rest", top.slice(6).reduce((a, [, v]) => a + v, 0)]);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("class", "donut");
  const ring = (color, len, offset, faded) => {
    const el = document.createElementNS(ns, "circle");
    for (const [k, v] of Object.entries({ cx: 60, cy: 60, r: R, fill: "none", stroke: color, "stroke-width": 14,
      "stroke-dasharray": Math.max(0.5, len - GAP) + " " + C, "stroke-dashoffset": -offset, transform: "rotate(-90 60 60)", "stroke-linecap": "butt" })) el.setAttribute(k, v);
    if (faded) el.setAttribute("opacity", ".25");
    return el;
  };
  svg.append(ring("var(--track)", C + GAP, 0, false));
  let at = 0;
  for (const [name, v] of parts) {
    const len = v / total * C;
    svg.append(ring(name === "Rest" ? "var(--faint)" : catStyle(name).color, len, at, catFilter && catFilter !== name));
    at += len;
  }
  return h("div.donutbox", svg, h("div.donutmid", h("div.serif", F.moneyShort(total)), h("div.caps", "spent")));
}

// Income and expenses start fresh each month; this button shows them over all time (corrections left out).
function totalsBlock() {
  const t = F.today();
  const all = db.all("transactions").filter(x => { const dd = d(x, "date"); return dd && dd <= t && !isNeutral(x) && (!acct || accountOf(x) === acct); });
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

// ---------------- Wallet cards ----------------
const accountColor = a => !a ? "--accent" : a === "Bank" ? "--blue" : a === "Cash" ? "--money" : /sav|spar/i.test(a) ? "--home" : /paypal/i.test(a) ? "--notes" : "--today";
const accountIconName = a => !a ? "wallet" : a === "Bank" ? "bank" : a === "Cash" ? "cash" : /sav|spar/i.test(a) ? "pig" : "wallet";

// The stack: the chosen card in front (tap it to set / count its balance, swipe it to the next one),
// the others peek out above it (tap one to bring it to the front), dots + "Account" below.
function walletStack(t, upTo, current) {
  const list = [null, ...accounts()];
  const back = list.filter(a => a !== acct);
  const PEEK = 48, H = 128;   // a back card shows its whole top line (icon, name, balance)
  const pick = a => { acct = a; catFilter = null; go("money"); };
  const box = h("div.wallet", { style: { height: (back.length * PEEK + H) + "px" } });
  const make = (a, front) => {
    const bal = balanceOn(front ? upTo : t, a || undefined);
    const checked = F.parseIso(db.setting("cashChecked", ""));
    const label = !a ? (current || !front ? "Balance · you have" : "Balance on " + F.date(upTo)) : !front ? "" : a === "Cash" ? "Tap to count" : "Tap to set";
    const meta = !front ? null : !a ? accounts().join(" + ") : a === "Bank" ? "main account" : a === "Cash" ? (checked ? "counted " + F.relative(checked) : "count it once") : "";
    const el = h("div.wcard" + (front ? ".front" : ""),
      h("div.whead", tile(accountIconName(a), accountColor(a)),
        h("div", { style: { flex: "1", minWidth: "0" } }, h("div.wname", a || "All accounts"), label ? h("div.caps", label) : null),
        front ? null : h("div.serif" + (bal < 0 ? ".red" : ""), { style: { fontSize: "16px" } }, F.signedMoney(bal))),
      front ? h("div.wbal.serif" + (bal < 0 ? ".red" : ""), F.signedMoney(bal)) : null,
      meta ? h("div.wmeta", meta) : null);
    el.style.setProperty("--wc", "var(" + accountColor(a) + ")");
    return el;
  };
  back.forEach((a, i) => {
    const el = make(a, false);
    Object.assign(el.style, { top: i * PEEK + "px", zIndex: String(i + 1), transform: "scale(" + Math.min(.98, .9 + i * .03) + ")", transformOrigin: "top center" });
    el.addEventListener("click", () => pick(a));
    box.append(el);
  });
  const front = make(acct, true);
  if (lastFront === acct) front.classList.remove("front-in"); else front.classList.add("front-in");
  lastFront = acct;
  Object.assign(front.style, { top: back.length * PEEK + "px", zIndex: "20" });
  front.addEventListener("click", () => { if (acct && current) askBalance(acct); else if (!acct) toast("Tap Bank or Cash above to set its balance"); });
  // swipe the front card left / right for the next / previous one
  let sx = null;
  front.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  front.addEventListener("touchend", e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) < 50) return;
    const i = list.indexOf(acct);
    pick(list[(i + (dx < 0 ? 1 : -1) + list.length) % list.length]);
  }, { passive: true });
  box.append(front);
  const dots = h("div.wdots", list.map(a => {
    const d = h("i" + (a === acct ? ".on" : ""), { onclick: () => pick(a), title: a || "All accounts" });
    if (a === acct) d.style.background = "var(" + accountColor(a) + ")";
    return d;
  }), h("button", { onclick: addAccount, "aria-label": "Add an account" }, "+ Account"));
  return [box, dots];
}

// "Set balance" / "Count cash": type what's really there, the difference becomes a correction (not income or spending).
export async function askBalance(account = "Bank") {
  const now = balanceOn(F.today(), account);
  const cash = account === "Cash";
  const answer = await ask(cash ? "Count your cash" : "Set " + account + " balance", cash ? "How much is in your wallet right now?" : "What's in your " + account + " account right now?", now.toFixed(2).replace(".", ","), "text");
  const v = F.parseAmount(answer);
  if (v == null) return;
  const diff = setBalance(v, account);
  toast(diff === 0 ? account + " already " + F.money(v) : account + " set to " + F.money(v) + " (correction " + F.signedMoney(diff) + ")");
}

// Move money between your accounts - a cash withdrawal is Bank -> Cash. Not income, not spending.
async function moveDialog() {
  const accs = accounts();
  const amount = h("input.field", { inputmode: "decimal", placeholder: "0,00" });
  const pick = (value) => h("select.field", accs.map(a => h("option", { value: a, selected: a === value }, accountIcon(a) + " " + a)));
  const from = pick("Bank"), to = pick(accs.includes("Cash") ? "Cash" : accs[1] || accs[0]);
  const day = h("input.field", { type: "date", value: F.todayIso() });
  const body = h("div", h("div.small.muted", "E.g. you took 50 € out at the ATM: Bank → Cash."),
    h("label", h("span.label.caps", "Amount"), calcField(amount)),
    h("div.grid2", h("label", h("span.label.caps", "From"), from), h("label", h("span.label.caps", "To"), to)),
    h("label", h("span.label.caps", "Date"), day));
  const ok = await dialog("Move money", body, [{ label: "Cancel", value: false }, { label: "Move it", value: true, main: true }]);
  if (!ok) return;
  const v = F.parseAmount(amount.value);
  if (v == null || v <= 0) { toast("Nothing moved - type an amount"); return; }
  if (from.value === to.value) { toast("Pick two different accounts"); return; }
  const pair = moveMoney(v, from.value, to.value, day.value);
  toast(pair[0].description + " " + F.money(v), "Undo", () => { for (const e of pair) db.remove("transactions", e); });
}

function openTransfer(x) {
  const pair = transferPair(x);
  const out = pair.find(p => num(p, "amount") < 0) || x, into = pair.find(p => num(p, "amount") > 0) || x;
  const s = sheet(x.description || "Transfer", h("div",
    h("div.list", h("div.row", h("div.grow", h("div.meta", "Amount"), h("div.title", F.money(Math.abs(num(x, "amount")))))),
      h("div.row", h("div.grow", h("div.meta", "From → to"), h("div.title", accountIcon(accountOf(out)) + " " + accountOf(out) + " → " + accountIcon(accountOf(into)) + " " + accountOf(into)))),
      h("div.row", h("div.grow", h("div.meta", "Date"), h("div.title", F.date(d(x, "date")))))),
    h("div.small.muted", "Moving money between your accounts isn't income or spending - it only changes where the money is.")), {
    actions: [btn("Delete", { kind: "danger", icon: "trash", onclick: () => { for (const e of pair) db.remove("transactions", e); s.close();
      toast("Transfer deleted", "Undo", () => { db.all("transactions").push(...pair); db.save("transactions"); }); } }),
      btn("Close", { kind: "primary", onclick: () => s.close() })] });
}

async function addAccount() {
  const name = await ask("New account", "E.g. PayPal or Savings", "", "text");
  if (!name) return;
  const accs = accounts();
  if (accs.some(a => a.toLowerCase() === name.toLowerCase())) { toast(name + " is already there"); return; }
  await db.setSetting("accounts", [...accs, name]);
  acct = name;
  toast("Account " + name + " added - count it once with “tap to set”");
  go("money");
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
    if (!x.date || x.date < since || x.date > today || x.repeat || isNeutral(x) || /paid back/i.test(x.category || "")) continue;
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
      count: list.length, lastDate: list[0].date, account: accountOf(list[0]) });
  }
  return out.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate)).slice(0, max);
}

const favLabel = f => catStyle(f.category).emoji + " " + f.description + " " + (f.fixed ? F.money(Math.abs(f.amount)) : "…");

function bookFavourite(f) {
  if (!f.fixed) return entrySheet(f);
  const account = acct || f.account || "Bank";
  const e = db.add("transactions", { description: f.description, amount: f.amount, category: f.category || guessCategory(f.description), date: F.todayIso(), ...(account !== "Bank" ? { account } : {}) });
  toast((f.amount > 0 ? "Income " : "Expense ") + F.money(Math.abs(f.amount)) + " · " + f.description + (account !== "Bank" ? " · " + accountIcon(account) + " " + account : ""), "Undo", () => db.remove("transactions", e));
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
  // which account: the one you're looking at, else what you used for this before (Bäcker -> Cash), else Bank
  let account = acct || "Bank", accountPicked = !!acct;
  const accBox = h("div.chips", { style: { flexWrap: "wrap", margin: "8px 0 0" } });
  const drawAccounts = () => {
    accBox.innerHTML = "";
    for (const a of accounts()) accBox.append(h("button.chip" + (a === account ? ".on" : ""), { type: "button", onpointerdown: e => e.preventDefault(),
      onclick: () => { account = a; accountPicked = true; drawAccounts(); } }, accountIcon(a) + " " + a));
  };
  drawAccounts();
  const fill = f => {
    what.value = f.description; cat.value = f.category || ""; picked = !!cat.value; chips && chips.redraw();
    if (!accountPicked && f.account) { account = f.account; drawAccounts(); }
    isIncome = f.amount > 0; drawToggle();
    amount.value = f.fixed ? F.plainAmount(Math.abs(f.amount)) : "";
    amount.dispatchEvent(new Event("input"));
    setTimeout(() => amount.focus(), 50);
  };
  cat.addEventListener("input", () => { picked = !!cat.value; });
  // your categories as buttons, most used first (expenses and income kept apart)
  const DEFAULTS = { true: ["Income"], false: ["Groceries", "Eating out", "Transport", "Fun", "Clothes", "Other"] };
  const catsFor = inc => usedMost("transactions", "category", DEFAULTS[inc], 40)
    .filter(c => DEFAULTS[inc].includes(c) || db.all("transactions").some(x => x.category === c && (num(x, "amount") > 0) === inc)).slice(0, 14);
  const catBox = h("div");
  let chips = null;
  const drawCats = () => { catBox.innerHTML = ""; chips = choiceChips(cat, catsFor(isIncome), c => catStyle(c).emoji + " " + c); catBox.append(chips); };
  what.addEventListener("input", () => {
    if (!picked) { cat.value = what.value ? guessCategory(what.value).replace(/^Other$/, "") : ""; chips && chips.redraw(); }
    if (!accountPicked) { const g = guessAccount(what.value) || "Bank"; if (g !== account) { account = g; drawAccounts(); } }
  });
  const toggle = h("div.seg");
  const drawToggle = () => {
    toggle.innerHTML = "";
    toggle.append(h("button" + (!isIncome ? ".on" : ""), { onclick: () => { isIncome = false; drawToggle(); } }, "Expense"),
      h("button" + (isIncome ? ".on" : ""), { onclick: () => { isIncome = true; drawToggle(); } }, "Income"));
    drawCats();
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
    const e = db.add("transactions", { description: desc, amount: isIncome ? v : -v, category: c, date: day.value || F.todayIso(), ...(account !== "Bank" ? { account } : {}) });
    income = isIncome;
    s.close();
    toast((isIncome ? "Income " : "Expense ") + F.money(v) + " · " + desc + (account !== "Bank" ? " · " + accountIcon(account) + " " + account : ""), "Undo", () => db.remove("transactions", e));
  };
  for (const el of [amount, what, cat]) el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  const s = sheet("New entry", h("div", toggle, accBox, favBox, calcField(amount),
    h("label", h("span.label.caps", "What for"), what),
    h("label", h("span.label.caps", "Category"), cat), catBox,
    h("label", h("span.label.caps", "Date"), day),
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
