// The form for any record, in a bottom sheet. Every change is saved right away (no Save button), like the desktop app.
// Uses the iPhone's own pickers for dates and choices.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { KINDS, titleOf, names } from "./kinds.js";
import { h, sheet, btn, switchEl, tickBox, toast, icon } from "./ui.js";
import { catStyle } from "./cats.js";

// editRecord("tasks", rec, { isNew, actions: [{label, icon, run}], top: element shown under the title })
export function editRecord(kind, rec, opts = {}) {
  const K = KINDS[kind];
  let saveTimer = null;
  const changed = () => {
    db.touch(rec);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.save(kind), 250);
  };
  const set = (key, value) => {
    if (value === "" || value == null) delete rec[key]; else rec[key] = value;
    changed();
  };

  const body = h("div");
  for (const f of K.fields) {
    if (f.key === K.titleKey) continue;
    body.append(fieldEditor(kind, rec, f, set, changed));
  }

  const titleInput = h("input.field.serif", { value: rec[K.titleKey] || "", placeholder: K.fields.find(f => f.key === K.titleKey).label,
    style: { fontSize: "22px", background: "none", border: "0", padding: "4px 0", borderBottom: "1px solid var(--border)", borderRadius: "0" } });
  titleInput.addEventListener("input", () => set(K.titleKey, titleInput.value));

  const actions = [];
  for (const a of opts.actions || []) {
    actions.push(btn(a.label, { kind: "soft", icon: a.icon, onclick: () => { flush(); s.close(); a.run(rec); } }));
  }
  actions.push(btn("Delete", { kind: "danger", icon: "trash", onclick: () => {
    clearTimeout(saveTimer);
    const index = db.remove(kind, rec);
    s.close();
    toast("Deleted “" + titleOf(kind, rec) + "”", "Undo", () => { db.all(kind).splice(Math.max(0, index), 0, rec); db.save(kind); });
  } }));
  actions.push(btn("Done", { kind: "primary", onclick: () => s.close() }));

  const flush = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; db.save(kind); } };
  const s = sheet(null, h("div", h("div.caps", { style: { margin: "2px 0 6px" } }, K.one), titleInput, opts.top || null, body), {
    actions,
    onClose: () => {
      flush();
      // a new record left without a title isn't kept
      if (opts.isNew && !rec[K.titleKey] && db.all(kind).includes(rec)) db.remove(kind, rec);
    }
  });
  if (opts.isNew) setTimeout(() => titleInput.focus(), 250);
  return s;
}

function labeled(text, el) {
  return h("label", h("span.label.caps", text), el);
}

// An amount field with a small calculator: + − × ÷ buttons (the iPhone number pad has none), "= 15,70 €" while you
// type a sum, and the sum turns into its result when you leave the field.
export function calcField(input, onResult) {
  const result = h("div.small.muted", { style: { minHeight: "18px", marginTop: "4px" } });
  const update = () => {
    const sum = F.isSum(input.value);
    const v = F.parseAmount(input.value);
    result.textContent = sum ? (v == null ? "not a sum I can work out" : "= " + F.money(v)) : "";
  };
  const opBtn = (label, op) => h("button.chip", { type: "button", onpointerdown: e => e.preventDefault(),
    onclick: () => { input.value = input.value.trim() + op; input.dispatchEvent(new Event("input")); input.focus(); } }, label);
  input.addEventListener("input", update);
  input.addEventListener("blur", () => {
    if (!F.isSum(input.value)) return;
    const v = F.parseAmount(input.value);
    if (v == null) return;
    input.value = F.plainAmount(v);
    input.dispatchEvent(new Event("input"));
    onResult && onResult(v);
  });
  return h("div", input, h("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginTop: "6px" } },
    opBtn("+", "+"), opBtn("−", "-"), opBtn("×", "*"), opBtn("÷", "/"), h("div.grow", { style: { flex: "1" } }), result));
}

// What you've used in a field, most used first (then the built-in choices): your saved categories, shops, lists …
export function usedMost(kind, key, extra = [], max = 12) {
  const count = new Map();
  for (const r of db.all(kind)) {
    const v = (r[key] || "").trim();
    if (v && !/correction|korrektur/i.test(v)) count.set(v, (count.get(v) || 0) + 1);
  }
  const out = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  for (const c of extra) if (!out.some(o => o.toLowerCase() === c.toLowerCase())) out.push(c);
  return out.slice(0, max);
}

// Those choices as buttons under a field - tap one to pick it (you can still type a new one).
// box.redraw() after the field was changed by code.
export function choiceChips(input, options, label = o => o) {
  const box = h("div.chips", { style: { flexWrap: "wrap", margin: "6px 0 0" } });
  const draw = () => {
    box.innerHTML = "";
    const now = input.value.trim().toLowerCase();
    for (const o of options) {
      box.append(h("button.chip" + (now === o.toLowerCase() ? ".on" : ""), { type: "button", onpointerdown: e => e.preventDefault(),
        onclick: () => { input.value = input.value.trim().toLowerCase() === o.toLowerCase() ? "" : o; input.dispatchEvent(new Event("input")); } }, label(o)));
    }
  };
  input.addEventListener("input", draw);
  draw();
  box.redraw = draw;
  if (!options.length) box.style.display = "none";
  return box;
}
const catLabel = c => catStyle(c).emoji + " " + c;

function fieldEditor(kind, rec, f, set, changed) {
  switch (f.type) {
    case "long": {
      const t = h("textarea.field", { rows: f.rows || 3 });
      t.value = rec[f.key] || "";
      t.addEventListener("input", () => set(f.key, t.value));
      return labeled(f.label, t);
    }
    case "money": case "number": {
      const v = rec[f.key];
      const i = h("input.field", { inputmode: "decimal", placeholder: f.hint || "", value: v == null ? "" : (f.type === "money" ? Number(v).toFixed(2).replace(".", ",") : String(v).replace(".", ",")) });
      i.addEventListener("input", () => {
        const n = f.type === "money" ? F.parseAmount(i.value) : F.parseNumber(i.value);
        i.style.color = i.value && n == null && !F.isSum(i.value) && !/[-+*/×x÷:]\s*$/.test(i.value) ? "var(--red)" : "";
        if (!i.value.trim()) set(f.key, null); else if (n != null) set(f.key, n);
      });
      return labeled(f.label + (f.type === "money" ? " (" + F.currency() + ")" : ""), f.type === "money" ? calcField(i) : i);
    }
    case "date": {
      const i = h("input.field", { type: "date", value: rec[f.key] || "" });
      i.addEventListener("change", () => set(f.key, i.value || null));
      return labeled(f.label, i);
    }
    case "choice": {
      const s = h("select.field", ["", ...f.choices].map(c => h("option", { value: c, selected: (rec[f.key] || "") === c }, c || "–")));
      s.addEventListener("change", () => set(f.key, s.value || null));
      return labeled(f.label, s);
    }
    case "open": {
      const listId = "dl-" + kind + "-" + f.key;
      const options = [...new Set([...(f.choices || []), ...names(kind, f.key)])];
      const i = h("input.field", { list: listId, value: rec[f.key] || "", placeholder: "type or pick" });
      i.addEventListener("input", () => set(f.key, i.value.trim() || null));
      const money = kind === "transactions" || kind === "repeats";
      const chips = choiceChips(i, usedMost(kind, f.key, f.choices || [], money ? 14 : 10), money && f.key === "category" ? catLabel : o => o);
      return labeled(f.label, h("div", i, h("datalist", { id: listId }, options.map(o => h("option", { value: o }))), chips));
    }
    case "bool": {
      const row = h("div.row", { style: { borderBottom: "0", padding: "6px 0" } }, h("div.grow", f.label), switchEl(rec[f.key] === true, on => set(f.key, on)));
      return row;
    }
    case "tags": {
      const i = h("input.field", { value: (rec[f.key] || []).join(", "), placeholder: "comma, separated" });
      i.addEventListener("input", () => set(f.key, i.value.split(",").map(s => s.trim()).filter(Boolean)));
      return labeled(f.label, i);
    }
    case "url": {
      const i = h("input.field", { type: "url", value: rec[f.key] || "", placeholder: "https://…" });
      i.addEventListener("input", () => set(f.key, i.value.trim() || null));
      const open = h("a.btn.small", { href: "#", onclick: e => { e.preventDefault(); if (i.value) window.open(i.value.includes("://") ? i.value : "https://" + i.value, "_blank"); } }, "Open");
      return labeled(f.label, h("div", { style: { display: "flex", gap: "8px" } }, i, open));
    }
    case "checklist":
      return labeled(f.label, checklist(rec, f.key, changed));
    default: {
      const i = h("input.field", { value: rec[f.key] || "", placeholder: f.hint || "" });
      i.addEventListener("input", () => set(f.key, i.value));
      return labeled(f.label, i);
    }
  }
}

// Tick, edit, remove items; type into the last line and press Enter (Return) to add.
export function checklist(rec, key, changed) {
  const box = h("div");
  const draw = () => {
    box.innerHTML = "";
    const items = rec[key] = rec[key] || [];
    items.forEach(item => {
      const text = h("input.field", { value: item.text || "", style: item.done ? { color: "var(--faint)", textDecoration: "line-through" } : {} });
      text.addEventListener("input", () => { item.text = text.value; changed(); });
      box.append(h("div.check",
        tickBox(item.done, () => { item.done = !item.done; changed(); draw(); }),
        text,
        h("button.btn.ghost.small", { html: icon("x", 16), onclick: () => { items.splice(items.indexOf(item), 1); changed(); draw(); } })));
    });
    const add = h("input.field", { placeholder: "Add an item…", enterkeyhint: "done" });
    add.addEventListener("keydown", e => {
      if (e.key === "Enter" && add.value.trim()) {
        e.preventDefault();
        items.push({ text: add.value.trim(), done: false });
        changed(); draw();
        box.querySelector("input:last-of-type")?.focus();
      }
    });
    box.append(h("div.check", { style: { paddingLeft: "36px" } }, add));
  };
  draw();
  return box;
}

// Opens the form for a new record with the kind's defaults (plus extra values).
export function newRecord(kind, extra = {}, opts = {}) {
  const rec = { ...KINDS[kind].defaults(), ...extra };
  db.add(kind, rec);
  return editRecord(kind, rec, { ...opts, isNew: true });
}
