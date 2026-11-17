// Numbers, money and dates as text and back - the German way (1.234,56 €, 17.11.2026), stored the computer way
// (1234.56, "2026-11-17"). Dates are plain "YYYY-MM-DD" strings everywhere, like in the desktop app.

import { settings } from "./db.js";

const money2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const currency = () => settings().currency || "€";
export const money = v => money2.format(v || 0) + " " + currency();
export const moneyShort = v => money0.format(v || 0) + " " + currency();
export const signedMoney = v => (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v || 0));
export const number = v => num.format(v || 0);
export const percent = f => Math.round((f || 0) * 100) + " %";
export const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

// "12,50", "12.50", "1.234,56", "2.350", "-3", "12 €" -> number, or null.
export function parseNumber(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/€|\$|\s/g, "").replace("−", "-");
  if (!s) return null;
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (comma >= 0) s = s.replace(",", ".");
  else if (dot >= 0 && (s.indexOf(".") !== dot || /^[+-]?\d{1,3}(\.\d{3})+$/.test(s))) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// --- dates ---

const pad = n => String(n).padStart(2, "0");
export const iso = d => d ? d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) : "";
export function parseIso(s) {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const todayIso = () => iso(today());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(d.getDate(), daysInMonth(x.getFullYear(), x.getMonth())));
  return x;
};
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const daysBetween = (a, b) => Math.round((b - a) / 86400000);
export const monthKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1);
export const date = d => d ? pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() : "";
export const shortDate = d => d ? pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." : "";
export const weekday = d => WEEKDAYS[d.getDay()];
export const dayDate = d => d ? weekday(d) + " " + shortDate(d) : "";
export const monthName = (y, m) => MONTHS[m] + " " + y;
export const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));

// "today", "tomorrow", "in 3 days", "2 days ago", "in 5 weeks", or the date.
export function relative(d) {
  if (!d) return "";
  const days = daysBetween(today(), d);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days < 14) return "in " + days + " days";
  if (days < -1 && days > -14) return -days + " days ago";
  if (days >= 14 && days < 60) return "in " + Math.floor(days / 7) + " weeks";
  if (days <= -14 && days > -60) return Math.floor(-days / 7) + " weeks ago";
  return date(d);
}

// What people type: "17.11.2026", "17.11.", "2026-11-17", today/heute, tomorrow/morgen, +3, +2w, +1m,
// a weekday in English or German ("fri", "fr", "freitag") = the next one. null when it can't be read.
const DAYNAMES = [["sun", "so", "sonntag", "sunday"], ["mon", "mo", "montag", "monday"], ["tue", "di", "dienstag", "tuesday"],
  ["wed", "mi", "mittwoch", "wednesday"], ["thu", "do", "donnerstag", "thursday"], ["fri", "fr", "freitag", "friday"], ["sat", "sa", "samstag", "saturday"]];
export function parseDate(text) {
  if (!text) return null;
  const s = String(text).trim().toLowerCase();
  const t = today();
  if (["today", "heute", "t"].includes(s)) return t;
  if (["tomorrow", "morgen", "tm"].includes(s)) return addDays(t, 1);
  if (["yesterday", "gestern"].includes(s)) return addDays(t, -1);
  let m = s.match(/^([+-])(\d+)([dwmy]?)$/);
  if (m) {
    const n = +m[2] * (m[1] === "-" ? -1 : 1);
    return m[3] === "w" ? addDays(t, 7 * n) : m[3] === "m" ? addMonths(t, n) : m[3] === "y" ? addMonths(t, 12 * n) : addDays(t, n);
  }
  for (let i = 0; i < 7; i++) {
    if (DAYNAMES[i].includes(s) || (s.length >= 3 && (DAYNAMES[i][2].startsWith(s) || DAYNAMES[i][3].startsWith(s)))) {
      let d = addDays(t, 1);
      while (d.getDay() !== i) d = addDays(d, 1);
      return d;
    }
  }
  const isoDate = parseIso(s);
  if (isoDate) return isoDate;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
  if (m) {
    let y = m[3] ? +m[3] : t.getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  return null;
}

// The next date a yearly thing (birthday) happens, from today on.
export function nextYearly(d) {
  if (!d) return null;
  const t = today();
  let n = new Date(t.getFullYear(), d.getMonth(), Math.min(d.getDate(), daysInMonth(t.getFullYear(), d.getMonth())));
  if (n < t) n = new Date(t.getFullYear() + 1, d.getMonth(), Math.min(d.getDate(), daysInMonth(t.getFullYear() + 1, d.getMonth())));
  return n;
}

export const nowStamp = () => { const d = new Date(); return iso(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
