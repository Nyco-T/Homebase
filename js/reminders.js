// Everything with a date in one list: what the calendar draws, what Home shows under "Coming up", and what the bell
// rings for - from the lists, the automation's reminder rules, and the backup reminder.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { dues } from "./kinds.js";
import { allReminderRules, enabled, level } from "./auto.js";

const AREA_OF = { events: "tasks", tasks: "tasks", notes: "tasks", transactions: "money", repeats: "money", shopping: "home", meals: "home", recipes: "home", chores: "home" };

let cache = null, cachedFor = "";

export function all() {
  const key = db.dataVersion() + ":" + new Date().getHours() + ":" + F.todayIso();
  if (cache && key === cachedFor) return cache;
  const out = dues();
  for (const r of allReminderRules()) {
    if (!enabled(r.id) || level(r.area) < 2) continue;
    try { out.push(...r.dues()); } catch (e) { console.error(r.id, e); }
  }
  const last = F.parseIso(db.setting("lastBackup", ""));
  const hasData = db.all("tasks").length + db.all("transactions").length + db.all("shopping").length > 0;
  if (hasData && (!last || F.daysBetween(last, F.today()) >= 7)) {
    out.push({ date: F.today(), title: "Make a backup", detail: last ? "last one " + F.relative(last) : "never made one yet", kind: "backup", id: null, lead: 0, icon: "download", color: "--warn" });
  }
  cache = out.filter(x => x.date).sort((a, b) => a.date - b.date);
  cachedFor = key;
  return cache;
}

export const between = (from, to) => all().filter(x => x.date >= from && x.date <= to);
export const keyOf = x => x.kind + ":" + x.id + ":" + F.iso(x.date) + ":" + x.title;
const reminds = x => x.kind === "backup" || level(AREA_OF[x.kind] || "tasks") >= 1;

// What needs you now: reminders whose lead time started, overdue ones up to 60 days back, not hidden.
export function active() {
  const t = F.today();
  const hidden = new Set(db.all("dismissed").map(r => r.key));
  return all().filter(x => x.lead >= 0 && x.date <= F.addDays(t, x.lead) && x.date >= F.addDays(t, -60) && !hidden.has(keyOf(x)) && reminds(x));
}

export function dismiss(x) {
  db.add("dismissed", { key: keyOf(x), date: F.iso(x.date) });
}
