// More: Notes, Automation, Settings & backup.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, btn, seg, toast, empty, section, switchEl, confirm, dialog, chips } from "../ui.js";
import * as lock from "../lock.js";
import * as push from "../push.js";
import { editRecord, newRecord } from "../form.js";
import * as auto from "../auto.js";
import * as reminders from "../reminders.js";
import { go, state, installUpdate, VERSION } from "../app.js";

let noteSearch = "";

export function render(root, sub) {
  if (sub === "notes") return notes(root);
  if (sub === "automation") return automation(root);
  if (sub === "settings") return settings(root);
  root.append(h("div.head", h("h1.serif", "More")));
  const pending = auto.suggestions().length;
  const backupDue = reminders.active().some(x => x.kind === "backup");
  root.append(h("div.list",
    menuRow("note", "--notes", "Notes", F.plural(db.all("notes").length, "note", "notes"), "more/notes"),
    menuRow("bolt", "--accent", "Automation", pending ? F.plural(pending, "suggestion", "suggestions") + " waiting" : "levels, rules and what it did", "more/automation", pending),
    menuRow("gear", "--muted", "Settings & backup", backupDue ? "time for a backup" : "look, backup, import", "more/settings", backupDue ? 1 : 0)));
  if (!matchMedia("(display-mode: standalone)").matches && !navigator.standalone) {
    root.append(h("div.banner", h("span", { html: icon("download", 20) }),
      h("div.grow", "Install Homebase: in Safari tap ", h("b", "Share"), " → ", h("b", "Add to Home Screen"), ". Then it works offline like an app.")));
  }
}

function menuRow(ic, color, title, meta, hash, badge) {
  return h("div.row", { onclick: () => go(hash) }, tile(ic, color), h("div.grow", h("div.title", title), h("div.meta", meta)),
    badge ? h("span.badge", String(badge)) : null, h("span.faint", { html: icon("right", 18) }));
}

function back(root, title) {
  root.append(h("div.head", h("button.btn.ghost.small", { html: icon("left", 22), onclick: () => go("more") }), h("h1.serif", title)));
}

// ---------------- Notes ----------------

function notes(root) {
  back(root, "Notes");
  const search = h("input.field", { type: "search", placeholder: "Search notes", value: noteSearch });
  search.addEventListener("input", () => { noteSearch = search.value; draw(); });
  root.append(h("div.quick", search));
  const box = h("div");
  root.append(box);
  const draw = () => {
    box.innerHTML = "";
    const q = noteSearch.toLowerCase();
    const all = db.all("notes").filter(n => !q || JSON.stringify(n).toLowerCase().includes(q))
      .sort((a, b) => (b.pinned === true) - (a.pinned === true) || (b.updated || b.created || "").localeCompare(a.updated || a.created || ""));
    if (!all.length) { box.append(empty(db.all("notes").length ? "No note matches." : "Write down anything. Automatic reports (money, weekly review) land here too.")); return; }
    box.append(h("div.list", all.map(n => h("div.row", { onclick: () => editRecord("notes", n) },
      tile((n.tags || []).includes("automation") ? "bolt" : "note", (n.tags || []).includes("automation") ? "--accent" : "--notes"),
      h("div.grow", h("div.title", (n.pinned ? "📌 " : "") + (n.title || "Untitled")), h("div.meta", (n.body || "").replace(/\n/g, " ").slice(0, 80)))))));
  };
  draw();
  root.append(h("button.fab", { "aria-label": "New note", html: icon("plus", 26), onclick: () => newRecord("notes") }));
}

// ---------------- Automation ----------------

function automation(root) {
  back(root, "Automation");
  root.append(h("div.sub", "Homebase does the routine work by itself. Choose how much per area - everything it does can be undone."));

  // levels
  const levels = h("div.card", h("div.cardhead", h("h2", "Levels")));
  for (const [id, a] of Object.entries(auto.AREAS)) {
    const lv = auto.level(id);
    levels.append(h("div", { style: { padding: "8px 0" } },
      h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, tile(a.icon, a.color), h("div.grow", h("div.title", a.title), h("div.meta", lv + " · " + auto.LEVELS[lv] + " - " + auto.LEVEL_ABOUT[lv]))),
      h("div.dial", auto.LEVELS.map((name, i) => h("button" + (i < lv ? ".lit" : i === lv ? ".at" : ""), { onclick: async () => { await auto.setLevel(id, i); auto.run(); toast(a.title + ": " + i + " · " + name); } }, String(i))))));
  }
  root.append(levels);

  // suggestions
  const pending = auto.suggestions();
  root.append(section("Suggestions" + (pending.length ? " · " + pending.length : "")));
  if (!pending.length) root.append(h("div.list", h("div.row", h("div.grow.muted.small", "Nothing waiting."))));
  else root.append(h("div.list", pending.map(p => h("div.row",
    tile(auto.AREAS[p.rule.area].icon, auto.AREAS[p.rule.area].color),
    h("div.grow", h("div.title", p.finding.title), h("div.meta", p.finding.detail)),
    btn(p.finding.yes, { kind: "soft", small: true, onclick: () => { auto.accept(p); toast("Done"); } }),
    h("button.btn.ghost.small", { html: icon("x", 16), onclick: () => auto.decline(p) })))));

  // what it did
  const log = db.all("autolog").slice().reverse().slice(0, 60);
  root.append(section("What Homebase did"));
  if (!log.length) root.append(h("div.list", h("div.row", h("div.grow.muted.small", "Nothing yet - everything it does by itself shows here, with Undo."))));
  else root.append(h("div.list", log.map(r => h("div.row",
    tile(auto.AREAS[r.area]?.icon || "bolt", r.undone ? "--faint" : auto.AREAS[r.area]?.color || "--accent"),
    h("div.grow", h("div.title" + (r.undone ? ".done" : ""), r.text), h("div.meta", (r.time || "").slice(0, 16).replace("T", " ") + (r.undone ? " · undone" : ""))),
    r.undone ? null : btn("Undo", { kind: "ghost", small: true, onclick: () => { auto.undo(r); toast("Undone: " + r.text); } })))));

  // rules
  root.append(section("Rules"));
  for (const [id, a] of Object.entries(auto.AREAS)) {
    const rows = [];
    for (const r of auto.allRules().filter(x => x.area === id)) {
      const on = auto.enabled(r.id, r.onByDefault);
      const lv = auto.level(id);
      const stateText = !on ? "off" : lv >= r.autoAt ? "acting" : lv >= r.suggestAt ? "suggesting" : "needs level " + Math.min(r.suggestAt, r.autoAt);
      rows.push(h("div.row", h("div.grow", h("div.title", r.title + "  ", h("span.pill", stateText)), h("div.meta", { style: { whiteSpace: "normal" } }, r.about)),
        switchEl(on, async v => { await auto.enable(r.id, v); auto.run(); })));
    }
    for (const r of auto.allReminderRules().filter(x => x.area === id)) {
      rows.push(h("div.row", h("div.grow", h("div.title", r.title + "  ", h("span.pill", auto.level(id) >= 2 ? "reminding" : "needs level 2")), h("div.meta", { style: { whiteSpace: "normal" } }, r.about)),
        switchEl(auto.enabled(r.id), async v => { await auto.enable(r.id, v); auto.run(); })));
    }
    root.append(h("div.caps", { style: { margin: "12px 2px 6px", color: `var(${a.color})` } }, a.title));
    root.append(h("div.list", rows));
  }
  if (auto.lastError) root.append(h("div.small.red", "Last problem: " + auto.lastError));
}

// ---------------- Settings & backup ----------------

function settings(root) {
  back(root, "Settings");
  if (state.updateReady) root.append(h("div.banner", h("div.grow", "A new version is ready."), btn("Reload", { kind: "primary", small: true, onclick: installUpdate })));

  // look
  const themes = ["system", "dark", "light"];
  root.append(section("Look"));
  root.append(seg(["System", "Dark", "Light"], themes.indexOf(db.setting("theme", "system")), i => db.setSetting("theme", themes[i])));

  // everyday settings
  const currency = h("input.field", { value: db.setting("currency", "€"), style: { width: "90px" } });
  currency.addEventListener("change", () => db.setSetting("currency", currency.value.trim() || "€"));
  const staples = h("input.field", { value: db.setting("staples", "oil, öl, salt, salz, pepper, pfeffer, oregano, paprika, water, wasser") });
  staples.addEventListener("change", () => db.setSetting("staples", staples.value));
  root.append(h("div.card",
    h("label", h("span.label.caps", { style: { marginTop: "0" } }, "Currency sign"), currency),
    h("label", h("span.label.caps", "Always at home (never put on the shopping list)"), staples)));

  // notifications
  const supported = "Notification" in window;
  root.append(section("Notifications"));
  root.append(pushBlock());
  root.append(h("div.list", h("div.row",
    h("div.grow", h("div.title", "Morning summary"), h("div.meta", { style: { whiteSpace: "normal" } },
      supported ? "One notification a day with what's due, when you open Homebase - plus the number on the app icon." : "Needs Homebase on the Home Screen (iOS 16.4 or newer).")),
    supported ? switchEl(db.setting("notify", false), async on => {
      if (on && Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        if (p !== "granted") { toast("Notifications not allowed - you can allow them in the iPhone settings"); db.setSetting("notify", false); return; }
      }
      db.setSetting("notify", on);
    }) : null)));

  // privacy: the Face ID lock
  root.append(section("Privacy"));
  root.append(privacyBlock());

  // backup
  const last = F.parseIso(db.setting("lastBackup", ""));
  root.append(section("Backup", last ? "last one " + F.relative(last) : "never"));
  const file = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
  file.addEventListener("change", () => importFile(file.files[0]));
  root.append(h("div.card",
    h("div.small.muted", { style: { marginBottom: "10px" } }, "Your data lives only on this phone. Save a backup to Files / iCloud now and then - Homebase reminds you after 7 days."),
    h("div.btnrow", btn("Export backup", { kind: "primary", icon: "download", onclick: exportFile }), btn("Import", { icon: "upload", onclick: () => file.click() })),
    file,
    h("div.small.faint", { style: { marginTop: "10px" } }, "Import also takes the file from the desktop Homebase (Settings → Export for iPhone). It replaces the lists in the file.")));

  // about
  root.append(section("About"));
  const counts = ["tasks", "events", "transactions", "shopping", "recipes", "notes"].map(n => db.all(n).length + " " + n).join(" · ");
  root.append(h("div.card",
    h("div.small", "Homebase Mobile " + VERSION),
    h("div.small.muted", { style: { margin: "4px 0 10px" } }, counts),
    btn("Check for update", { small: true, onclick: async () => {
      if (!navigator.onLine) { toast("Offline - updates come when you're online"); return; }
      try { await state.checkUpdate?.(); toast(state.updateReady ? "A new version is ready" : "You have the newest version"); } catch (e) { toast("Couldn't check right now"); }
    } })));
}

async function exportFile() {
  const data = db.exportData();
  const name = "homebase-backup-" + F.todayIso() + ".json";
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = h("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click(); a.remove();
    }
    await db.setSetting("lastBackup", F.todayIso());
    toast("Backup saved");
  } catch (e) {
    if (e.name !== "AbortError") toast("Backup failed: " + e.message);
  }
}

async function importFile(f) {
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const n = Object.values(data.lists || {}).reduce((a, l) => a + (Array.isArray(l) ? l.length : 0), 0);
    const from = data.from || (data.exported ? "the desktop app" : "a file");
    if (!(await confirm("Import " + F.plural(n, "entry", "entries") + "?", "From " + from + (data.exported ? ", saved " + data.exported.replace("T", " ").slice(0, 16) : "") + ". The lists in the file replace the ones on this phone.", "Import"))) return;
    const count = await db.importData(data);
    toast("Imported " + F.plural(count, "entry", "entries"));
    go("home");
  } catch (e) {
    toast("Couldn't import: " + e.message);
  }
}

// ---------------- Privacy: Face ID lock ----------------

function privacyBlock() {
  const box = h("div.list");
  const draw = async () => {
    box.innerHTML = "";
    const on = lock.isOn();
    box.append(h("div.row", tile("lock", "--accent"),
      h("div.grow", h("div.title", "Face ID lock"), h("div.meta", { style: { whiteSpace: "normal" } }, on ? (lock.hasFaceId() ? "on · Face ID and backup code" : "on · backup code only") : "asks for Face ID when Homebase opens")),
      switchEl(on, async want => {
        if (want) { if (await turnOn()) draw(); else draw(); }
        else if (await confirm("Turn off the lock?", "Homebase opens without Face ID or code again.", "Turn off", true)) { await db.setSetting("lock.on", false); toast("Lock off"); draw(); }
        else draw();
      })));
    if (!on) return;
    if (!lock.hasFaceId()) {
      const ok = await lock.faceIdAvailable();
      box.append(h("div.row", h("div.grow", h("div.title", "Face ID"), h("div.meta", { style: { whiteSpace: "normal" } }, ok ? "Not set up yet - the iPhone asks to save a passkey for Homebase" : "Not available here - the backup code works")),
        ok ? btn("Set up", { kind: "soft", small: true, onclick: async () => {
          try { await lock.setUpFaceId(); toast("Face ID is set up 🔒"); draw(); }
          catch (e) { toast("Face ID wasn't set up - try again"); }
        } }) : null));
    }
    const afterRow = h("div.row", { style: { flexWrap: "wrap" } }, h("div.grow", { style: { flex: "1 0 100%" } }, h("div.title", "Lock again after")));
    afterRow.append(chips([["0", "right away"], ["60", "1 minute"], ["300", "5 minutes"]], String(lock.after()), k => { db.setSetting("lock.after", +k); draw(); }));
    box.append(afterRow);
    box.append(h("div.row", h("div.grow", h("div.title", "Backup code"), h("div.meta", "in case Face ID doesn't work")),
      btn("Change", { kind: "ghost", small: true, onclick: async () => { if (await askCode("New backup code")) toast("Backup code changed"); } })));
    box.append(h("div.row", h("div.grow", h("div.title", "Hide in the app switcher"), h("div.meta", { style: { whiteSpace: "normal" } }, "shows the lock screen instead of your money")),
      switchEl(lock.hideInSwitcher(), v => db.setSetting("lock.hide", v))));
    box.append(h("div.row", h("div.grow.small.muted", { style: { whiteSpace: "normal" } }, "Face ID stays on your iPhone - Homebase never sees your face. If you can't unlock, the backup code always works. This hides your data from others holding your phone; it doesn't encrypt it.")));
  };
  draw();
  return box;
}

// A backup code, typed twice (4 to 8 digits).
async function askCode(title) {
  const a = h("input.field", { type: "password", inputmode: "numeric", autocomplete: "new-password", placeholder: "4 to 8 digits" });
  const b = h("input.field", { type: "password", inputmode: "numeric", autocomplete: "new-password", placeholder: "Once more" });
  const ok = await dialog(title, h("div", h("div.small.muted", "You'll need it if Face ID ever doesn't work. Don't forget it."),
    h("label", h("span.label.caps", "Code"), a), h("label", h("span.label.caps", "Repeat"), b)), [{ label: "Cancel", value: false }, { label: "Save", value: true, main: true }]);
  if (!ok) return false;
  if (!/^\d{4,8}$/.test(a.value)) { toast("The code needs 4 to 8 digits"); return false; }
  if (a.value !== b.value) { toast("The two codes don't match"); return false; }
  await lock.setCode(a.value);
  return true;
}

// Turning the lock on: backup code first (so you can never be locked out), then Face ID with one more tap.
async function turnOn() {
  if (!(await askCode("Set a backup code"))) return false;
  await db.setSetting("lock.on", true);
  toast(await lock.faceIdAvailable() ? "Lock on - now tap “Set up” for Face ID" : "Lock on with your backup code");
  return true;
}

// ---------------- Push through ntfy ----------------

function pushBlock() {
  const box = h("div.list", { style: { marginBottom: "8px" } });
  const draw = () => {
    const c = push.conf();
    box.innerHTML = "";
    box.append(h("div.row", tile("bell", "--accent"),
      h("div.grow", h("div.title", "Push through ntfy"), h("div.meta", { style: { whiteSpace: "normal" } }, c.on ? "on · works when Homebase is closed" : "reminders even when Homebase is closed - needs the free ntfy app")),
      switchEl(c.on, async on => {
        await push.setConf({ on, topic: c.topic || push.newTopic() });
        if (on) { const n = await push.schedule(); toast(n ? F.plural(n, "notification", "notifications") + " scheduled" : "Push on - now add your channel in the ntfy app"); }
        draw();
      })));
    if (!c.on) return;
    const chip = (label, active, onclick) => h("button.chip" + (active ? ".on" : ""), { type: "button", onclick }, label);
    const set = async patch => { await push.setConf(patch); draw(); push.reschedule(); };
    box.append(h("div.row", { style: { display: "block" } },
      h("div.title", "Your secret channel"),
      h("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" } },
        h("code", { style: { flex: "1", fontSize: "13px", padding: "8px 10px", borderRadius: "10px", background: "var(--glass)", border: "1px solid var(--glass-border)", userSelect: "all" } }, c.topic),
        btn("Copy", { kind: "soft", small: true, onclick: async () => { try { await navigator.clipboard.writeText(c.topic); toast("Copied - paste it in the ntfy app"); } catch (e) { toast("Press and hold the name to copy it"); } } })),
      h("div.meta", { style: { whiteSpace: "normal", marginTop: "5px" } }, "In the ntfy app: + → paste this name → Subscribe. Nobody can guess it.")));
    box.append(h("div.row", { style: { display: "block" } }, h("div.title", "Remind me before"),
      h("div.chips", { style: { flexWrap: "wrap", margin: "6px 0 0" } }, [5, 15, 30, 60].map(m => chip(m === 60 ? "1 hour" : m + " min", c.before === m, () => set({ before: m })))),
      h("div.meta", { style: { whiteSpace: "normal" } }, "tasks and appointments with a time · a change applies to reminders scheduled from now on")));
    box.append(h("div.row", { style: { display: "block" } }, h("div.title", "Morning summary"),
      h("div.chips", { style: { flexWrap: "wrap", margin: "6px 0 0" } }, [["", "off"], ["07:00", "07:00"], ["08:00", "08:00"], ["09:00", "09:00"]].map(([v, l]) => chip(l, c.morning === v, () => set({ morning: v })))),
      h("div.meta", { style: { whiteSpace: "normal" } }, "how many tasks, appointments, birthdays, chores and payments today")));
    box.append(h("div.row", { style: { display: "block" } }, h("div.title", "Evening preview"),
      h("div.chips", { style: { flexWrap: "wrap", margin: "6px 0 0" } }, [["", "off"], ["19:00", "19:00"], ["20:00", "20:00"], ["21:00", "21:00"]].map(([v, l]) => chip(l, c.evening === v, () => set({ evening: v })))),
      h("div.meta", "what tomorrow holds")));
    box.append(h("div.row", h("div.grow", h("div.title", "Payments the day before"), h("div.meta", { style: { whiteSpace: "normal" } }, "“A payment goes out tomorrow” in the evening (at the evening preview time, else 19:00) - rent, phone, subscriptions; no names or amounts")),
      switchEl(c.payments, v => set({ payments: v }))));
    box.append(h("div.row", h("div.grow", h("div.title", "Show details"), h("div.meta", { style: { whiteSpace: "normal" } }, c.details ? "on · task and appointment titles go through ntfy.sh" : "off · only the kind of thing leaves your phone (“A task is due in 15 minutes”)")),
      switchEl(c.details, v => set({ details: v }))));
    const last = db.setting("ntfy.last", "");
    box.append(h("div.row", h("div.grow", h("div.title", "Send a test"), h("div.meta", last ? "last scheduled " + F.relative(F.parseIso(last)) + " " + last.slice(11, 16) : "arrives in about 10 seconds")),
      btn("Test", { kind: "soft", small: true, onclick: async () => { try { await push.test(); toast("Test sent - it arrives in about 10 seconds"); } catch (e) { toast("Couldn't reach ntfy.sh - are you online?"); } } })));
  };
  draw();
  return box;
}
