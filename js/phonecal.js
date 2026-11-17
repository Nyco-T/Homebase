// Your iPhone calendar inside Homebase. Apple doesn't let web apps read the calendar, so a small Shortcut
// (Kurzbefehle app) copies the coming events as text lines, and Homebase reads them from the clipboard.
// One line per event:  HB|start|end|all day|calendar|place|title
// (dates as ISO 8601 "2026-11-17T18:30:00+01:00", or German "17.11.2026, 18:30" / "17. Nov. 2026 um 18:30").
// The copies live in the events list with source "iphone": a new read updates them, adds new ones and drops coming
// ones that are gone from the iPhone. They're read-only here - you change them in the iPhone's Calendar app.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { h, sheet, btn, toast, tile } from "./ui.js";

const pad = n => String(n).padStart(2, "0");
const MONTHS = { jan: 0, feb: 1, mär: 2, mar: 2, apr: 3, mai: 4, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dez: 11, dec: 11 };

export const isPhone = e => e?.source === "iphone";

// "2026-11-17T18:30:00+01:00", "17.11.2026, 18:30", "17. November 2026 um 18:30", "Nov 17, 2026 at 6:30 PM" -> { day, time }
export function parseWhen(text) {
  const s = (text || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) {
    if (m[4] && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {   // with a time zone: show it in the phone's own time
      const x = new Date(s);
      if (!isNaN(x)) return { day: new Date(x.getFullYear(), x.getMonth(), x.getDate()), time: pad(x.getHours()) + ":" + pad(x.getMinutes()) };
    }
    return { day: new Date(+m[1], +m[2] - 1, +m[3]), time: m[4] ? m[4] + ":" + m[5] : "" };
  }
  const clock = (hh, mm, ampm) => {
    if (hh == null) return "";
    let H = +hh;
    if (/pm/i.test(ampm || "") && H < 12) H += 12;
    if (/am/i.test(ampm || "") && H === 12) H = 0;
    return pad(H) + ":" + mm;
  };
  m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\D+?(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (m) return { day: new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]), time: clock(m[4], m[5], m[6]) };
  m = s.match(/(\d{1,2})\.?\s+([a-zäöü]+)\.?\s+(\d{4})(?:\D+?(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return { day: new Date(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]), time: clock(m[4], m[5], m[6]) };
  m = s.match(/([a-zäöü]+)\.?\s+(\d{1,2}),?\s+(\d{4})(?:\D+?(\d{1,2}):(\d{2})\s*(am|pm)?)?/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return { day: new Date(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]), time: clock(m[4], m[5], m[6]) };
  return null;
}

const yes = s => /^(yes|ja|true|wahr|1)$/i.test((s || "").trim());

// The lines from the Shortcut -> events (null when there are none in the text).
export function parse(text) {
  const out = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^HB\|/i.test(line)) continue;
    const [, start, end, allDay, calendar, place, ...rest] = line.split("|");
    const title = rest.join("|").trim();
    const from = parseWhen(start);
    if (!from || !title) continue;
    const whole = yes(allDay);
    const to = parseWhen(end);
    let endDay = to?.day || null;
    if (endDay && whole && (!to.time || to.time === "00:00") && endDay > from.day) endDay = F.addDays(endDay, -1);   // all day ends at midnight of the next day
    const e = { title, date: F.iso(from.day), source: "iphone", repeat: "Never", phoneCalendar: (calendar || "").trim() };
    if (!whole && from.time) e.time = from.time + (to?.time && endDay && endDay.getTime() === from.day.getTime() && to.time !== from.time ? "–" + to.time : "");
    if (endDay && endDay > from.day) e.end = F.iso(endDay);
    if ((place || "").trim()) e.place = place.trim();
    e.category = /geburtstag|birthday/i.test(e.phoneCalendar) ? "Birthday" : (e.phoneCalendar || "iPhone");
    out.push(e);
  }
  return out.length ? out : null;
}

const keyOf = e => [e.phoneCalendar || "", e.title, e.date, (e.time || "").slice(0, 5)].join("|").toLowerCase();
const FIELDS = ["title", "date", "time", "end", "place", "category", "phoneCalendar"];

// Puts the events in: same ones are updated, new ones added, coming ones that are gone from the iPhone dropped.
export function apply(items) {
  const today = F.todayIso();
  const list = db.all("events");
  const mine = new Map(list.filter(isPhone).map(e => [keyOf(e), e]));
  const seen = new Set();
  let added = 0, changed = 0, removed = 0;
  for (const it of items) {
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k);
    const old = mine.get(k);
    if (!old) { db.add("events", it); added++; continue; }
    let diff = false;
    for (const f of FIELDS) {
      if ((old[f] || "") !== (it[f] || "")) { diff = true; if (it[f]) old[f] = it[f]; else delete old[f]; }
    }
    if (diff) { db.touch(old); changed++; }
  }
  // gone from the iPhone: from tomorrow on (the Shortcut may leave out what already happened today)
  for (const [k, e] of mine) {
    if (!seen.has(k) && (e.date || "") > today) { list.splice(list.indexOf(e), 1); removed++; }
  }
  db.save("events");
  db.setSetting("phonecal.last", F.nowStamp());
  return { added, changed, removed, total: seen.size };
}

const summary = r => F.plural(r.total, "event", "events") + " · " + ([r.added && r.added + " new", r.changed && r.changed + " changed", r.removed && r.removed + " removed"].filter(Boolean).join(", ") || "nothing new");

export const lastRead = () => db.setting("phonecal.last", "");

// "Get iPhone calendar": reads what the Shortcut copied. Has to run from a tap (the iPhone asks "Paste?").
export async function update() {
  let text = null;
  try { text = await navigator.clipboard.readText(); } catch (e) { /* not allowed or not supported - paste by hand */ }
  if (text == null) return pasteSheet();
  const items = parse(text);
  if (!items) return pasteSheet("No calendar in the clipboard. Run the shortcut “Homebase Kalender” first, then tap Update again - or paste it below.");
  toast("iPhone calendar: " + summary(apply(items)));
}

function pasteSheet(note) {
  const area = h("textarea.field", { placeholder: "HB|2026-11-20T18:30:00+01:00|…", rows: 5 });
  const s = sheet("Get iPhone calendar", h("div",
    h("div.small.muted", { style: { marginBottom: "10px" } }, note || "Run the shortcut “Homebase Kalender”, then paste here."), area),
    { actions: [btn("How to set it up", { onclick: () => { s.close(); setupSheet(); } }),
      btn("Read", { kind: "primary", onclick: () => {
        const items = parse(area.value);
        if (!items) { toast("No calendar lines found in that text"); return; }
        s.close();
        toast("iPhone calendar: " + summary(apply(items)));
      } })] });
}

// The steps for the Shortcut, once.
export function setupSheet() {
  const step = (n, text) => h("div.row", h("span.badge", { style: { position: "static", flex: "none" } }, String(n)), h("div.grow.small", { style: { whiteSpace: "normal" } }, text));
  const s = sheet("Show your iPhone calendar", h("div",
    h("div.small.muted", { style: { marginBottom: "10px" } }, "Apple doesn't let web apps read the calendar. A small shortcut does it for Homebase - set it up once in the Shortcuts app (Kurzbefehle)."),
    h("div.list",
      step(1, "Kurzbefehle → + (new shortcut) → name it “Homebase Kalender”."),
      step(2, "Add “Kalenderereignisse suchen” (Find Calendar Events): Filter “Startdatum” “ist in den nächsten” 60 Tage. Sort by Startdatum, no limit."),
      step(3, "Add “Wiederholen mit jedem” (Repeat with Each) with the events."),
      step(4, "Inside it add “Text” and type exactly: HB| then the event's Startdatum | Enddatum | Ganztägig | Kalender | Ort | Titel (Start Date, End Date, Is All Day, Calendar, Location, Title) - each separated by |. Tap Startdatum and Enddatum → Datumsformat “ISO 8601”, Zeit einschließen on."),
      step(5, "After the loop (below “Wiederholen beenden”): “Text kombinieren” with “Neue Zeile”, then “In Zwischenablage kopieren”."),
      step(6, "Run it, open Homebase → Plan → Calendar → Update. Done - run it again whenever your calendar changed."),
      step(7, "Automatic: Kurzbefehle → Automation → + → Tageszeit 07:00, daily → “Sofort ausführen” → run “Homebase Kalender”. Then just tap Update in Homebase.")),
    h("div.small.muted", { style: { marginTop: "10px" } }, "Example line: HB|2026-11-20T18:30:00+01:00|2026-11-20T20:00:00+01:00|Nein|Privat|Kino|Movie night")),
    { actions: [btn("Close", { onclick: () => s.close() }), btn("Update now", { kind: "primary", icon: "phone", onclick: () => { s.close(); update(); } })] });
}

// Tapping an iPhone event: show it (read-only).
export function show(e) {
  const line = (label, value) => value ? h("div.row", h("div.grow", h("div.meta", label), h("div.title", { style: { whiteSpace: "normal" } }, value))) : null;
  const day = F.parseIso(e.date);
  const s = sheet(e.title, h("div",
    h("div.list",
      line("When", F.weekday(day) + ", " + F.date(day) + (e.time ? " · " + e.time : " · all day") + (e.end ? " – " + F.date(F.parseIso(e.end)) : "")),
      line("Where", e.place),
      line("Calendar", e.phoneCalendar || "iPhone")),
    h("div.row", tile("phone", "--today"), h("div.grow.small.muted", { style: { whiteSpace: "normal" } },
      "From your iPhone calendar. Change it in the Calendar app - Homebase picks it up the next time you tap Update."))),
    { actions: [btn("Close", { kind: "primary", onclick: () => s.close() })] });
}
