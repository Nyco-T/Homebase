// The automation engine - the same idea as the desktop app (src/core/Auto.java).
// Each area has a level 0-5: 0 Manual, 1 Reminds, 2 Suggests, 3 Acts, 4 Chains, 5 Outside.
// A rule returns findings; at level >= autoAt they're done right away (with Undo in the log), at level >= suggestAt
// they wait as suggestions. A finding is handled once (automarks), so Undo is never redone. Automation never deletes.

import * as db from "./db.js";

export const AREAS = {
  money: { title: "Money", icon: "wallet", color: "--money" },
  tasks: { title: "Tasks & calendar", icon: "check", color: "--today" },
  home: { title: "Shopping, meals & chores", icon: "cart", color: "--home" },
};
export const LEVELS = ["Manual", "Reminds", "Suggests", "Acts", "Chains", "Outside"];
export const LEVEL_ABOUT = ["Only stores what you enter", "Reminders and badges", "Proposes the next step - one tap to accept",
  "Does it by itself and tells you (Undo in the log)", "One thing leads to the next", "Writes reports for you"];
export const NEVER = 99;

const rules = [];
const reminderRules = [];
let pending = [];
let running = false;
export let lastError = "";

export const level = area => Math.max(0, Math.min(5, Number(db.setting("auto." + area, 5))));
export const setLevel = (area, n) => db.setSetting("auto." + area, n);
export const enabled = (id, byDefault = true) => db.setting("rule." + id, byDefault) !== false;
export const enable = (id, on) => db.setSetting("rule." + id, on);
export const active = r => enabled(r.id, r.onByDefault) && level(r.area) >= Math.min(r.suggestAt, r.autoAt);
export const allRules = () => rules;
export const allReminderRules = () => reminderRules;
export const suggestions = () => pending;

export function rule(id, area, title, about, suggestAt, autoAt, find, onByDefault = true) {
  rules.push({ id, area, title, about, suggestAt, autoAt, find, onByDefault });
}

export function reminder(id, area, title, about, dues) {
  reminderRules.push({ id, area, title, about, dues });
}

export const find = (key, title, detail, yes, apply) => ({ key, title, detail, yes, apply });

// --- once-only memory ---
export const marks = () => new Set(db.all("automarks").map(r => r.key));
export function mark(key) {
  db.all("automarks").push({ id: db.newId(), key, date: db.stamp().slice(0, 10), updated: db.stamp() });
  db.save("automarks");
}

// --- changes that can be undone ---
export class Tx {
  constructor() { this.ops = []; this.kinds = new Set(); }
  add(kind, rec) {
    if (!rec.id) rec.id = db.newId();
    if (!rec.created) rec.created = db.stamp();
    rec.auto = true;
    db.touch(rec);
    db.all(kind).push(rec);
    this.ops.push({ op: "add", kind, id: rec.id });
    this.kinds.add(kind);
    return rec;
  }
  set(kind, rec, key, value) {
    this.ops.push({ op: "set", kind, id: rec.id, key, old: rec[key] === undefined ? null : JSON.parse(JSON.stringify(rec[key])) });
    if (value == null) delete rec[key]; else rec[key] = value;
    db.touch(rec);
    this.kinds.add(kind);
  }
  append(kind, rec, key, item) {
    this.ops.push({ op: "set", kind, id: rec.id, key, old: rec[key] === undefined ? null : JSON.parse(JSON.stringify(rec[key])) });
    (rec[key] = rec[key] || []).push(item);
    db.touch(rec);
    this.kinds.add(kind);
  }
  // takes back what was done so far (when applying fails half-way)
  rollback() { undo({ ops: this.ops, undone: false, _noLog: true }); this.ops = []; }
  commit(r, text) {
    for (const k of this.kinds) db.save(k);
    const log = db.all("autolog");
    log.push({ id: db.newId(), created: db.stamp(), updated: db.stamp(), time: db.stamp(), rule: r.id, area: r.area, level: level(r.area), text, undone: false, ops: this.ops });
    if (log.length > 500) log.splice(0, log.length - 400);
    db.save("autolog");
  }
}

export function undo(entry) {
  if (entry.undone) return;
  const kinds = new Set();
  for (const op of [...(entry.ops || [])].reverse()) {
    kinds.add(op.kind);
    if (op.op === "add") {
      const list = db.all(op.kind);
      const i = list.findIndex(r => r.id === op.id);
      if (i >= 0) list.splice(i, 1);
    } else {
      const r = db.byId(op.kind, op.id);
      if (r) { if (op.old == null) delete r[op.key]; else r[op.key] = op.old; db.touch(r); }
    }
  }
  for (const k of kinds) db.save(k);
  entry.undone = true;
  if (entry._noLog) return;
  db.touch(entry);
  db.save("autolog");
}

// --- running ---

let bookkeeping = () => {};
export const setBookkeeping = fn => { bookkeeping = fn; };

// Runs every rule once. Returns the titles of what was done by itself.
export function run() {
  if (running) return [];
  running = true;
  const done = [];
  const waiting = [];
  try { prune(); } catch (e) { console.error(e); }
  const seen = marks();
  try {
    bookkeeping();
    for (const r of rules) {
      if (!active(r)) continue;
      let found = [];
      try { found = r.find() || []; } catch (e) { lastError = r.id + ": " + e.message; console.error(r.id, e); continue; }
      for (const f of found) {
        if (seen.has(f.key) || seen.has("no:" + f.key)) continue;
        seen.add(f.key);
        if (level(r.area) >= r.autoAt) {
          const tx = new Tx();
          try { f.apply(tx); tx.commit(r, f.title); mark(f.key); done.push(f.title); }
          catch (e) { tx.rollback(); lastError = r.id + ": " + e.message; console.error(e); }   // nothing half-done stays
        } else if (level(r.area) >= r.suggestAt) {
          waiting.push({ rule: r, finding: f });
        }
      }
    }
  } finally {
    running = false;
  }
  pending = waiting;
  db.fire("automation");
  return done;
}

// Returns false when it couldn't be done - then nothing is changed (what was done half-way is taken back).
export function accept(p) {
  const tx = new Tx();
  try { p.finding.apply(tx); }
  catch (e) { tx.rollback(); lastError = p.rule.id + ": " + e.message; console.error(e); pending = pending.filter(x => x !== p); db.fire("automation"); return false; }
  tx.commit(p.rule, p.finding.title);
  mark(p.finding.key);
  pending = pending.filter(x => x !== p);
  db.fire("automation");
  return true;
}

// The once-only memory would grow forever: marks for shopping items that are gone, and anything older than
// two years, are dropped (once a day). The things they stood for can't come back by then.
let prunedOn = "";
function prune() {
  const today = db.stamp().slice(0, 10);
  if (prunedOn === today) return;
  prunedOn = today;
  const list = db.all("automarks");
  const shopping = new Set(db.all("shopping").map(s => s.id));
  const cutoff = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
  const keep = list.filter(m => !(m.key.startsWith("buy:") && !shopping.has(m.key.slice(4))) && (m.date || today) >= cutoff);
  if (keep.length !== list.length) { list.length = 0; list.push(...keep); db.save("automarks"); }
}

export function decline(p) {
  mark("no:" + p.finding.key);
  pending = pending.filter(x => x !== p);
  db.fire("automation");
}
