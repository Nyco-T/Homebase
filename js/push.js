// Push notifications through the free ntfy app - they arrive even when Homebase is closed.
// Homebase schedules them on ntfy.sh (at most 3 days ahead) each time it runs; ntfy delivers them on time.
// Privacy ("middle way"): only the KIND of thing and a time leave the phone - "A task is due in 15 minutes",
// "3 tasks, 1 appointment today" - never titles, places, names or amounts. "Show details" can add titles (opt-in).
// The channel is a random name only your ntfy app knows.
//
// What rings:
//  - tasks with a time and appointments with a time: X minutes before (5 / 15 / 30 / 60)
//  - morning summary (default 08:00): tasks today and overdue, appointments, birthdays (today and tomorrow),
//    chores, payments to confirm, time off starting, counting cash, backup - as counts
//  - evening preview (optional, default 20:00): what tomorrow holds, as counts
//  - payments: the evening before money goes out (repeating expenses, entries booked for that day) - no names, no amounts
// Events that came from the iPhone calendar are left out of the "before" reminders - your iPhone already rings for them.

import * as db from "./db.js";
import * as F from "./fmt.js";
import * as reminders from "./reminders.js";
import { isOn, d, num, nextChore, nextEvent, bookedByHand, isNeutral } from "./kinds.js";

const SERVER = "https://ntfy.sh/";
// the glass house, shown as a picture on the right of the notification (a public file of the app - no personal data)
const ICON = "https://nyco-t.github.io/Homebase/icons/icon-192.png";
const AHEAD_MS = 3 * 24 * 3600 * 1000 - 60 * 1000;   // ntfy.sh schedules at most 3 days ahead
const MAX_PER_RUN = 25;                                // stay well inside ntfy.sh's limits

const defaults = { on: false, topic: "", before: 15, morning: "08:00", evening: "", details: false, payments: true };
export const conf = () => ({ ...defaults, ...(db.setting("ntfy", {}) || {}) });
export const setConf = patch => db.setSetting("ntfy", { ...conf(), ...patch });

export function newTopic() {
  const abc = "abcdefghijkmnopqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint8Array(18));
  return "hb-" + [...r].map(x => abc[x % abc.length]).join("");
}

const at = (day, hhmm) => { const [h, m] = (hhmm || "00:00").split(":").map(Number); const x = new Date(day); x.setHours(h || 0, m || 0, 0, 0); return x; };
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const lead = n => n >= 60 ? "1 hour" : n + " minutes";

// ---------------- What should ring ----------------

// [{ key, when: Date, title, text, tags }]
export function planned(now = new Date()) {
  const c = conf();
  const until = new Date(now.getTime() + AHEAD_MS);
  const out = [];
  const add = (key, when, text, tags) => { if (when > new Date(now.getTime() + 15000) && when <= until) out.push({ key, when, title: "Homebase", text, tags }); };

  // before: tasks and appointments with a time
  const days = [0, 1, 2, 3].map(i => F.addDays(F.today(), i));
  for (const t of db.all("tasks")) {
    if (isOn(t, "done") || !t.due || !t.time) continue;
    const when = new Date(at(F.parseIso(t.due), t.time).getTime() - c.before * 60000);
    add("task:" + t.id + ":" + t.due + "T" + t.time, when, "✅ " + (c.details ? t.title + " · " + t.time : "A task is due in " + lead(c.before)), "white_check_mark");
  }
  for (const e of db.all("events")) {
    if (e.source === "iphone") continue;
    const tm = (e.time || "").match(/(\d{1,2})[:.](\d{2})/);
    if (!tm) continue;
    const hhmm = tm[1].padStart(2, "0") + ":" + tm[2];
    // a repeating one: its next times within the window
    let x = nextEvent(e);
    for (let i = 0; x && i < 4; i++) {
      if (days.some(dd => dd.getTime() === x.getTime())) {
        const when = new Date(at(x, hhmm).getTime() - c.before * 60000);
        add("event:" + e.id + ":" + F.iso(x) + "T" + hhmm, when, "📅 " + (c.details ? (e.title || "Appointment") + " · " + hhmm : "An appointment starts in " + lead(c.before)), "calendar");
      }
      if (!e.repeat || e.repeat === "Never") break;
      x = e.repeat === "Weekly" ? F.addDays(x, 7) : null;   // monthly / yearly don't come twice in 3 days
    }
  }

  // morning summary and evening preview: counts only - at most about a day ahead, so the numbers are fresh
  const soon = new Date(now.getTime() + 30 * 3600 * 1000);
  for (const day of days) {
    if (day > soon) break;
    if (c.morning) {
      const text = summary(day, true);
      if (text && at(day, c.morning) <= soon) add("morning:" + F.iso(day) + ":" + c.morning, at(day, c.morning), "☀️ Good morning · " + text, "sunny");
    }
    if (c.payments) {
      // the evening before (at the evening preview time, else 19:00)
      const n = paymentsOn(F.addDays(day, 1));
      const when = at(day, c.evening || "19:00");
      if (n && when <= soon) add("pay:" + F.iso(F.addDays(day, 1)), when, n === 1 ? "A payment goes out tomorrow" : n + " payments go out tomorrow", "");
    }
    if (c.evening) {
      const text = summary(F.addDays(day, 1), false);
      if (text && at(day, c.evening) <= soon) add("evening:" + F.iso(day) + ":" + c.evening, at(day, c.evening), "🌙 Tomorrow: " + text, "crescent_moon");
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

// How many payments go out on a day: repeating expenses due that day (not booked yet) and expenses booked for it.
function paymentsOn(day) {
  const iso = F.iso(day), key = iso.slice(0, 7);
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  let n = 0;
  for (const r of db.all("repeats")) {
    if (isOn(r, "paused") || num(r, "amount") >= 0) continue;
    const due = Math.max(1, Math.min(num(r, "day") || 1, last));
    if (due === day.getDate() && !bookedByHand(r, key)) n++;
  }
  n += db.all("transactions").filter(x => x.date === iso && num(x, "amount") < 0 && !isNeutral(x)).length;
  return n;
}

// "3 tasks (1 overdue), 1 appointment, 🎂 1 birthday today · tomorrow 1 birthday" - kinds and counts, nothing else.
function summary(day, morning) {
  const iso = F.iso(day), today = F.todayIso();
  const isBirthday = e => e.category === "Birthday" || /birthday|geburtstag/i.test(e.title || "");
  const on = (e, i) => { const x = nextEvent(e); return x && F.iso(x) === i; };
  const tasks = db.all("tasks").filter(t => !isOn(t, "done") && t.due === iso).length;
  const overdue = morning && iso === today ? db.all("tasks").filter(t => !isOn(t, "done") && t.due && t.due < iso).length : 0;
  const evs = db.all("events").filter(e => on(e, iso));
  const birthdays = evs.filter(isBirthday).length;
  const appts = evs.length - birthdays;
  const chores = db.all("chores").filter(ch => { const n = F.iso(nextChore(ch)); return n === iso || (morning && iso === today && n < iso); }).length;
  const items = reminders.all().filter(x => x.date && F.iso(x.date) === iso);
  const pay = items.filter(x => x.kind === "confirm").length;
  const parts = [];
  if (tasks || overdue) parts.push(plural(tasks, "task", "tasks") + (overdue ? " (" + overdue + " overdue)" : ""));
  if (appts) parts.push(plural(appts, "appointment", "appointments"));
  if (birthdays) parts.push("🎂 " + plural(birthdays, "birthday", "birthdays"));
  if (chores) parts.push(plural(chores, "chore", "chores"));
  if (pay) parts.push(plural(pay, "payment", "payments") + " to confirm");
  if (db.all("timeoff").some(r => r.from === iso)) parts.push("🏖️ time off starts");
  if (items.some(x => x.kind === "countcash")) parts.push("count your cash");
  if (morning && items.some(x => x.kind === "backup")) parts.push("make a backup");
  let text = parts.join(", ") + (parts.length && morning ? " today" : "");
  if (morning) {
    const next = F.iso(F.addDays(day, 1));
    const bd = db.all("events").filter(e => isBirthday(e) && on(e, next)).length;
    if (bd) text += (text ? " · " : "") + "tomorrow " + plural(bd, "birthday", "birthdays");
  }
  return text;
}

// ---------------- Sending ----------------

async function publish(topic, n) {
  // no "tags": ntfy would put its own emoji in front of the title - the message already has one
  const q = new URLSearchParams({ title: n.title, at: String(Math.floor(n.when.getTime() / 1000)), attach: ICON, filename: "Homebase.png" });
  const r = await fetch(SERVER + encodeURIComponent(topic) + "?" + q, { method: "POST", body: n.text, headers: { "Content-Type": "text/plain" } });
  if (!r.ok) throw new Error("ntfy " + r.status);
}

let running = false;
// Schedules what's due in the next 3 days and wasn't scheduled yet. Safe to call often.
export async function schedule() {
  const c = conf();
  if (running || !c.on || !c.topic || !navigator.onLine) return 0;
  running = true;
  try {
    const now = Date.now();
    const sent = { ...(db.setting("ntfy.sent", {}) || {}) };
    let pruned = 0;
    for (const [k, t] of Object.entries(sent)) if (t < now - 3600 * 1000) { delete sent[k]; pruned++; }   // forget the past
    let n = 0;
    for (const item of planned()) {
      // one reminder per task/appointment and time: changing "Remind me before" doesn't schedule a second one
      // (scheduled messages can't be taken back) - the new lead time applies to what's scheduled from then on.
      // Older keys still carry the lead time at the end - they count as sent too.
      if (sent[item.key] || Object.keys(sent).some(k => k.startsWith(item.key + ":")) || n >= MAX_PER_RUN) continue;
      try { await publish(c.topic, item); sent[item.key] = item.when.getTime(); n++; }
      catch (e) { break; }   // offline or limited - next time
    }
    // saved only when something changed - a save redraws the page (and that once caused a loop with the automation)
    if (n || pruned) await db.setSetting("ntfy.sent", sent);
    if (n) await db.setSetting("ntfy.last", F.nowStamp());
    return n;
  } finally { running = false; }
}

export async function test() {
  const c = conf();
  await publish(c.topic, { title: "Homebase", text: "Test - notifications work", when: new Date(Date.now() + 12000) });
}

// After changing a setting: what's newly planned gets scheduled (already scheduled ones can't be taken back).
export const reschedule = () => schedule();
