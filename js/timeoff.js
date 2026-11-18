// Time off: vacation days per year, public holidays of your state, and how many days you have left.
// - A break counts only work days: weekends and public holidays are skipped (half day = 0.5, sick / school = 0).
// - Days of a year can be used until 31 March of the next year. A break takes the oldest days first, so
//   21.12.2026–05.01.2027 uses up what's left of 2026 and only the rest comes from 2027.
// - "Left this year when you started": the days you had already used before Homebase knew about them.

import * as db from "./db.js";
import * as F from "./fmt.js";

export const TYPES = { Vacation: 1, "Half day": 0.5, Sick: 0, School: 0 };
export const STATES = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen",
  MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen",
  ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };

export const perYear = () => Number(db.setting("vacation.perYear", 0)) || 0;
export const state = () => db.setting("vacation.state", "BW");
export const isSetUp = () => perYear() > 0;
const usedBefore = () => db.setting("vacation.usedBefore", {}) || {};

// ---------------- Public holidays ----------------

function easter(y) {   // Gauss / Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const cache = new Map();
// [{ date, name }] for a year and state, sorted
export function holidays(y, st = state()) {
  const key = y + st;
  if (cache.has(key)) return cache.get(key);
  const E = easter(y);
  const list = [
    [new Date(y, 0, 1), "New Year's Day"], [F.addDays(E, -2), "Good Friday"], [F.addDays(E, 1), "Easter Monday"], [new Date(y, 4, 1), "Labour Day"],
    [F.addDays(E, 39), "Ascension Day"], [F.addDays(E, 50), "Whit Monday"], [new Date(y, 9, 3), "German Unity Day"],
    [new Date(y, 11, 25), "Christmas Day"], [new Date(y, 11, 26), "Boxing Day"],
  ];
  const has = (...states) => states.includes(st);
  if (has("BW", "BY", "ST")) list.push([new Date(y, 0, 6), "Epiphany"]);
  if (has("BE", "MV")) list.push([new Date(y, 2, 8), "Women's Day"]);
  if (has("BW", "BY", "HE", "NW", "RP", "SL")) list.push([F.addDays(E, 60), "Corpus Christi"]);
  if (has("SL")) list.push([new Date(y, 7, 15), "Assumption Day"]);
  if (has("TH")) list.push([new Date(y, 8, 20), "Children's Day"]);
  if (has("BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH")) list.push([new Date(y, 9, 31), "Reformation Day"]);
  if (has("BW", "BY", "NW", "RP", "SL")) list.push([new Date(y, 10, 1), "All Saints' Day"]);
  if (has("SN")) { const nov23 = new Date(y, 10, 23); list.push([F.addDays(nov23, -(((nov23.getDay() + 7 - 3) % 7) || 7)), "Day of Repentance"]); }
  const out = list.map(([date, name]) => ({ date, name })).sort((a, b) => a.date - b.date);
  cache.set(key, out);
  return out;
}

export const holidayOn = day => holidays(day.getFullYear()).find(h => h.date.getTime() === day.getTime()) || null;
export const isWorkDay = day => day.getDay() !== 0 && day.getDay() !== 6 && !holidayOn(day);

// The work days of a break, with how much each one counts.
export function daysOf(r) {
  const from = F.parseIso(r.from), to = F.parseIso(r.to) || from;
  if (!from || to < from) return [];
  const weight = TYPES[r.type || "Vacation"] ?? 1;
  const out = [];
  for (let d = from, i = 0; d <= to && i < 400; d = F.addDays(d, 1), i++) if (isWorkDay(d)) out.push({ day: d, weight });
  return out;
}
export const countOf = r => daysOf(r).reduce((a, x) => a + x.weight, 0);
export const workDays = r => daysOf(r).length;

// ---------------- Days left per year ----------------

// { year: { total, before, used, planned, left, expires } } - each vacation day takes the oldest days that are still valid.
// (list: the breaks to count - the saved ones by default, or a "what if" list for the sheet's live preview)
export function balances(list = db.all("timeoff")) {
  const per = perYear();
  const now = F.today();
  const days = list.flatMap(r => daysOf(r).filter(x => x.weight > 0)).sort((a, b) => a.day - b.day);
  const years = new Set([now.getFullYear(), now.getFullYear() + 1, ...days.map(x => x.day.getFullYear())]);
  const out = {};
  for (const y of [...years].sort()) {
    const before = Number(usedBefore()[y] || 0);
    out[y] = { year: y, total: per, before, used: 0, planned: 0, left: per - before, expires: new Date(y + 1, 2, 31) };
  }
  for (const { day, weight } of days) {
    const y = day.getFullYear();
    // the oldest pool still valid on that day (last year's days until 31 March), else this year's
    const pool = (out[y - 1] && out[y - 1].left > 0 && day <= out[y - 1].expires) ? out[y - 1] : out[y];
    pool.left -= weight;
    if (day <= now) pool.used += weight; else pool.planned += weight;
  }
  return out;
}

// "I had 9 days left for 2026 before the breaks in Homebase" -> 20 used before Homebase knew about them.
// (Asked this way it's clear: the breaks you entered are taken off afterwards, oldest days first.)
export const availableBefore = year => perYear() - Number(usedBefore()[year] || 0);
export async function setAvailableBefore(year, days) {
  const before = Math.max(0, Math.round((perYear() - days) * 2) / 2);
  await db.setSetting("vacation.usedBefore", { ...usedBefore(), [year]: before });
}

// ---------------- Bridge days ----------------

// A holiday on a Tuesday or Thursday: one day off (Monday / Friday) gives you 4 days in a row.
export function bridgeDays(from, to) {
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    for (const h of holidays(y)) {
      if (h.date < from || h.date > to) continue;
      const wd = h.date.getDay();
      const bridge = wd === 2 ? F.addDays(h.date, -1) : wd === 4 ? F.addDays(h.date, 1) : null;
      if (bridge && isWorkDay(bridge) && !takenOn(bridge)) out.push({ holiday: h, bridge, free: 4 });
    }
  }
  return out;
}
// a day inside any break (its from..to range already covers every work day of it)
export const takenOn = (day, list = db.all("timeoff")) => list.some(r => { const a = F.parseIso(r.from); return a && a <= day && day <= (F.parseIso(r.to) || a); });

// How many days in a row you're off around a break (weekends and holidays before and after included).
export function freeInARow(r, list = db.all("timeoff")) {
  let from = F.parseIso(r.from), to = F.parseIso(r.to) || from;
  if (!from) return 0;
  const off = d => !isWorkDay(d) || takenOn(d, list);
  while (off(F.addDays(from, -1))) from = F.addDays(from, -1);
  while (off(F.addDays(to, 1))) to = F.addDays(to, 1);
  return F.daysBetween(from, to) + 1;
}
