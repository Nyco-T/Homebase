// More: Notes, Automation, Settings & backup.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, btn, seg, toast, empty, section, switchEl, confirm } from "../ui.js";
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
      h("div.dial", auto.LEVELS.map((name, i) => h("button" + (i < lv ? ".lit" : i === lv ? ".at" : ""), { onclick: () => { auto.setLevel(id, i); toast(a.title + ": " + i + " · " + name); } }, String(i))))));
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
        switchEl(on, v => auto.enable(r.id, v))));
    }
    for (const r of auto.allReminderRules().filter(x => x.area === id)) {
      rows.push(h("div.row", h("div.grow", h("div.title", r.title + "  ", h("span.pill", auto.level(id) >= 2 ? "reminding" : "needs level 2")), h("div.meta", { style: { whiteSpace: "normal" } }, r.about)),
        switchEl(auto.enabled(r.id), v => auto.enable(r.id, v))));
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
