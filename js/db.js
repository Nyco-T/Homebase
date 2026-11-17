// All data lives on the phone, in IndexedDB (database "homebase"). Each list ("tasks", "transactions", …) is one
// entry holding its records - the same records as the desktop app's JSON files. Everything is loaded into memory
// at start; a change writes that list back. Every record has id, created and updated (updated = ready for a later sync).

const DB_NAME = "homebase";
export const SCHEMA = 1;
export const LISTS = ["events", "tasks", "notes", "transactions", "repeats", "shopping", "meals", "recipes", "chores",
  "buylog", "automarks", "autolog", "dismissed", "rules"];

let db = null;
const cache = {};
let meta = { settings: {} };
const listeners = new Set();

function req(r) {
  return new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
}

export async function open() {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "name" });
    if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
  };
  db = await req(r);
  const tx = db.transaction(["lists", "meta"], "readonly");
  const lists = await req(tx.objectStore("lists").getAll());
  const metas = await req(tx.objectStore("meta").getAll());
  for (const name of LISTS) cache[name] = [];
  for (const l of lists) cache[l.name] = Array.isArray(l.items) ? l.items : [];
  for (const m of metas) meta[m.key] = m.value;
  meta.settings = meta.settings || {};
  await migrate();
}

// Data from an older version of the app is converted once - after a backup copy inside the database.
async function migrate() {
  const from = meta.schema || 0;
  if (from >= SCHEMA) return;
  const hasData = LISTS.some(n => cache[n].length);
  if (hasData) await putMeta("backup-schema-" + from, exportData());
  // (version 1 is the first one - later changes go here, step by step)
  await putMeta("schema", SCHEMA);
}

async function putMeta(key, value) {
  meta[key] = value;
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key, value });
  await new Promise(ok => { tx.oncomplete = ok; tx.onerror = ok; });
}

export const getMeta = key => meta[key];
export const setMeta = (key, value) => putMeta(key, value);

export function all(name) {
  if (!cache[name]) cache[name] = [];
  return cache[name];
}

export const byId = (name, id) => id ? all(name).find(r => r.id === id) || null : null;
export const newId = () => Math.random().toString(16).slice(2, 10);

export function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Marks a record as changed now (call before save()).
export function touch(rec) {
  rec.updated = stamp();
  return rec;
}

export function add(name, rec) {
  if (!rec.id) rec.id = newId();
  if (!rec.created) rec.created = stamp();
  touch(rec);
  all(name).push(rec);
  save(name);
  return rec;
}

export function remove(name, rec) {
  const list = all(name);
  const i = list.findIndex(r => r === rec || r.id === rec.id);
  if (i >= 0) list.splice(i, 1);
  save(name);
  return i;
}

// Writes one list and tells every page. Several saves of the same list in a row are written once.
const pending = new Set();
let timer = null;
export function save(name) {
  pending.add(name);
  fire(name);
  clearTimeout(timer);
  timer = setTimeout(flush, 120);
}

export async function flush() {
  if (!pending.size || !db) return;
  const names = [...pending];
  pending.clear();
  const tx = db.transaction("lists", "readwrite");
  for (const n of names) tx.objectStore("lists").put({ name: n, items: all(n) });
  await new Promise(ok => { tx.oncomplete = ok; tx.onerror = () => { console.error(tx.error); ok(); }; });
}

let version = 0;
export const dataVersion = () => version;
export function fire(name) {
  version++;
  for (const fn of listeners) fn(name);
}
export const listen = fn => listeners.add(fn);

// --- settings (theme, currency, automation levels, last backup …) ---

export const settings = () => meta.settings || {};
export function setting(key, fallback) {
  const v = settings()[key];
  return v === undefined ? fallback : v;
}
export async function setSetting(key, value) {
  meta.settings = { ...settings(), [key]: value };
  await putMeta("settings", meta.settings);
  fire("settings");
}

// --- import / export (same format as the desktop app's "Export for iPhone") ---

export function exportData() {
  const lists = {};
  for (const n of LISTS) lists[n] = all(n);
  return { format: "homebase-export", version: 1, from: "Homebase Mobile", schema: SCHEMA, exported: stamp(), settings: settings(), lists };
}

// Replaces every list that's in the file. Returns how many records came in.
export async function importData(data) {
  if (!data || data.format !== "homebase-export" || typeof data.lists !== "object") throw new Error("This isn't a Homebase export file.");
  let count = 0;
  for (const [name, items] of Object.entries(data.lists)) {
    if (!Array.isArray(items)) continue;
    cache[name] = items.map(r => ({ ...r, updated: r.updated || r.created || stamp() }));
    count += items.length;
    pending.add(name);
  }
  if (data.settings) {
    const keep = {};
    for (const [k, v] of Object.entries(data.settings)) if (k === "currency" || k.startsWith("auto.")) keep[k] = typeof v === "string" && /^\d+$/.test(v) ? +v : v;
    meta.settings = { ...settings(), ...keep };
    await putMeta("settings", meta.settings);
  }
  await flush();
  fire("import");
  return count;
}

// Asks the browser to keep the data even when the phone runs low on space.
export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}
