// "Send to iPhone Calendar": your Homebase calendar as a calendar file (.ics). The iPhone shows what's in it and
// adds it with "Add All". Every item keeps the same UID each time, so sending a changed one again updates it
// instead of adding a second copy. Events that came from the iPhone calendar are never sent back.

import * as db from "./db.js";
import * as F from "./fmt.js";
import * as TO from "./timeoff.js";
import { isOn, d } from "./kinds.js";

const pad = F.pad;
const ymd = day => day.getFullYear() + pad(day.getMonth() + 1) + pad(day.getDate());
const stampUtc = () => { const n = new Date(); return n.getUTCFullYear() + pad(n.getUTCMonth() + 1) + pad(n.getUTCDate()) + "T" + pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + pad(n.getUTCSeconds()) + "Z"; };
const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// lines longer than 75 bytes are folded (calendar files want that)
// lines may be at most 75 bytes (not characters - an emoji or umlaut takes several); longer ones continue with a space
const enc = new TextEncoder();
function fold(line) {
  const out = [];
  let cur = "", bytes = 0;
  for (const ch of line) {   // whole characters, never cut through one
    const b = enc.encode(ch).length;
    if (bytes + b > 75) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}
const RRULE = { Weekly: "FREQ=WEEKLY", Monthly: "FREQ=MONTHLY", Yearly: "FREQ=YEARLY" };
// A plain monthly rule on the 31st skips the shorter months (and 29.02. comes every 4 years); Homebase shows those on
// the month's last day - so the rule says "the last of the 28th…31st that the month has".
function rrule(repeat, day) {
  const dd = day.getDate();
  if (repeat === "Monthly" && dd > 28) return "FREQ=MONTHLY;BYMONTHDAY=" + [28, 29, 30, 31].filter(x => x <= dd).join(",") + ";BYSETPOS=-1";
  if (repeat === "Yearly" && day.getMonth() === 1 && dd === 29) return "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1";
  return RRULE[repeat] || null;
}

// "18:30" or "18:30–20:00" -> { start: "1830", end: "2000" | null }
function times(text) {
  const m = (text || "").match(/(\d{1,2})[:.](\d{2})(?:\s*[-–]\s*(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  return { start: pad(m[1]) + m[2], end: m[3] ? pad(m[3]) + m[4] : null };
}

// Everything that can be sent: [{ key, updated, lines[] , label }]
export function items(opts) {
  const out = [];
  if (opts.events) {
    for (const e of db.all("events")) {
      if (e.source === "iphone") continue;
      const day = d(e, "date");
      if (!day) continue;
      const t = times(e.time);
      const L = ["UID:hb-event-" + e.id + "@homebase", "SUMMARY:" + esc(e.title || "Event")];
      if (t) {
        L.push("DTSTART:" + ymd(day) + "T" + t.start + "00");
        let endH = t.end;
        if (!endH) {   // one hour, but never past midnight (23:30 ends at 23:59, not at 23:30)
          const m = Math.min(23 * 60 + 59, +t.start.slice(0, 2) * 60 + +t.start.slice(2) + 60);
          endH = pad(Math.floor(m / 60)) + pad(m % 60);
        }
        L.push("DTEND:" + ymd(d(e, "end") || day) + "T" + endH + "00");
      } else {
        L.push("DTSTART;VALUE=DATE:" + ymd(day), "DTEND;VALUE=DATE:" + ymd(F.addDays(d(e, "end") || day, 1)));
      }
      const rule = rrule(e.repeat, day);
      if (rule) L.push("RRULE:" + rule);
      if (e.place) L.push("LOCATION:" + esc(e.place));
      if (e.notes) L.push("DESCRIPTION:" + esc(e.notes));
      out.push({ key: "event:" + e.id, updated: e.updated || e.created || "", lines: L, label: e.title || "Event" });
    }
  }
  if (opts.timeoff) {
    for (const r of db.all("timeoff")) {
      const from = F.parseIso(r.from), to = F.parseIso(r.to) || from;
      if (!from) continue;
      const n = TO.countOf(r);
      const L = ["UID:hb-timeoff-" + r.id + "@homebase", "SUMMARY:" + esc((r.type === "Sick" ? "🤒 " : r.type === "School" ? "🏫 " : "🏖️ ") + (r.title || r.type || "Time off")),
        "DTSTART;VALUE=DATE:" + ymd(from), "DTEND;VALUE=DATE:" + ymd(F.addDays(to, 1)), "TRANSP:TRANSPARENT",
        "DESCRIPTION:" + esc((r.type || "Vacation") + (n ? " · " + String(n).replace(".", ",") + (n === 1 ? " vacation day" : " vacation days") : "") + " · from Homebase")];
      out.push({ key: "timeoff:" + r.id, updated: r.updated || r.created || "", lines: L, label: r.title || r.type || "Time off" });
    }
  }
  if (opts.tasks) {
    for (const t of db.all("tasks")) {
      if (isOn(t, "done") || !t.due) continue;
      const day = d(t, "due");
      if (!day) continue;
      const tm = times(t.time);   // a task with a time: 30 minutes at that time, else all day
      const when = tm ? ["DTSTART:" + ymd(day) + "T" + tm.start + "00", "DTEND:" + ymd(day) + "T" + (() => { const m = +tm.start.slice(0, 2) * 60 + +tm.start.slice(2) + 30; return pad(Math.min(23, Math.floor(m / 60))) + pad(m >= 24 * 60 ? 59 : m % 60); })() + "00"]
        : ["DTSTART;VALUE=DATE:" + ymd(day), "DTEND;VALUE=DATE:" + ymd(F.addDays(day, 1))];
      out.push({ key: "task:" + t.id, updated: t.updated || t.created || "", label: t.title || "Task",
        lines: ["UID:hb-task-" + t.id + "@homebase", "SUMMARY:" + esc("✅ " + (t.title || "Task")), ...when, "TRANSP:TRANSPARENT"] });
    }
  }
  if (opts.holidays && TO.isSetUp()) {
    const t = F.today();
    for (const y of [t.getFullYear(), t.getFullYear() + 1]) {
      for (const hd of TO.holidays(y)) {
        if (hd.date < t) continue;
        out.push({ key: "holiday:" + ymd(hd.date), updated: "1", label: hd.name,
          lines: ["UID:hb-holiday-" + ymd(hd.date) + "-" + TO.state() + "@homebase", "SUMMARY:" + esc("🎉 " + hd.name), "DTSTART;VALUE=DATE:" + ymd(hd.date), "DTEND;VALUE=DATE:" + ymd(F.addDays(hd.date, 1)), "TRANSP:TRANSPARENT"] });
      }
    }
  }
  return out;
}

// What was already sent: { key: updated }. "Only new" = not sent yet, or changed since.
const sent = () => db.setting("ics.sent", {}) || {};
export const isNew = it => sent()[it.key] !== it.updated;

// A changed item gets a higher version number, so the iPhone replaces its old copy.
const seqFor = it => { const s = sent(), seq = db.setting("ics.sequence", {}) || {}; return (seq[it.key] || 0) + (s[it.key] !== undefined && s[it.key] !== it.updated ? 1 : 0); };

export function file(list) {
  const now = stampUtc();
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Homebase//Homebase Mobile//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Homebase"];
  for (const it of list) {
    body.push("BEGIN:VEVENT", "DTSTAMP:" + now, "SEQUENCE:" + seqFor(it), ...it.lines, "END:VEVENT");
  }
  body.push("END:VCALENDAR");
  return body.map(fold).join("\r\n") + "\r\n";
}

// After sending: remember what went out (and count up its version, so a changed one replaces the old copy).
export function markSent(list) {
  const s = { ...sent() }, seq = { ...(db.setting("ics.sequence", {}) || {}) };
  for (const it of list) { seq[it.key] = seqFor(it); s[it.key] = it.updated; }
  db.setSetting("ics.sent", s);
  db.setSetting("ics.sequence", seq);
  db.setSetting("ics.last", F.nowStamp());
}

// Hands the file to the iPhone: the share sheet ("Save to Files", or straight to Calendar where offered), else a download.
export async function share(text) {
  const name = "Homebase calendar.ics";
  const f = new File([text], name, { type: "text/calendar" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: "Homebase calendar" }); return true; }
    catch (e) { if (e && e.name === "AbortError") return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}
