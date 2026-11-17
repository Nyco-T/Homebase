// Food: Shopping list · Meal plan · Recipes.

import * as db from "../db.js";
import * as F from "../fmt.js";
import { h, icon, tile, tickBox, btn, seg, toast, empty, section, sheet, dialog } from "../ui.js";
import { d, book, names } from "../kinds.js";
import { quickAdd } from "../quick.js";
import { editRecord, newRecord } from "../form.js";
import { isStaple } from "../rules.js";
import { go } from "../app.js";

const TABS = ["shopping", "meals", "recipes"];
const SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack"];
let week = null;
let recipeSearch = "";

export function render(root, sub) {
  const tab = TABS.includes(sub) ? sub : "shopping";
  root.append(h("div.head", h("h1.serif", "Food")));
  root.append(seg(["Shopping list", "Meal plan", "Recipes"], TABS.indexOf(tab), i => go("food/" + TABS[i])));
  if (tab === "shopping") shopping(root);
  else if (tab === "meals") meals(root);
  else recipes(root);
}

const fab = onclick => h("button.fab", { onclick, "aria-label": "New", html: icon("plus", 26) });

// ---------------- Shopping list ----------------

function shopping(root) {
  const input = h("input.field", { placeholder: "milk, 2 bread, 500 g cheese", enterkeyhint: "done" });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    quickAdd("buy " + text);
    input.value = "";
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  root.append(h("div.quick", input, btn("", { kind: "primary", icon: "plus", onclick: add })));

  const all = db.all("shopping");
  const open = all.filter(s => !s.done);
  const bought = all.filter(s => s.done);
  if (!all.length) root.append(empty("Your list is empty. Type what you need above - commas add several at once."));

  // open items, grouped by shop
  const byStore = {};
  for (const s of open) (byStore[s.store || "Anywhere"] = byStore[s.store || "Anywhere"] || []).push(s);
  for (const [store, items] of Object.entries(byStore).sort()) {
    root.append(section(store + " · " + items.length));
    root.append(h("div.list", items.map(s => h("div.row", { onclick: () => editRecord("shopping", s) },
      tickBox(false, () => { s.done = true; db.touch(s); db.save("shopping"); }),
      h("div.grow", h("div.title", s.item), [s.qty, s.notes].filter(Boolean).length ? h("div.meta", [s.qty, s.notes].filter(Boolean).join(" · ")) : null),
      s.price ? h("span.small.muted", F.money(s.price)) : null))));
  }

  // often bought: one tap puts it back on the list
  const often = db.all("buylog").filter(l => (l.dates || []).length >= 2 && !open.some(s => (s.item || "").toLowerCase() === l.item))
    .sort((a, b) => b.dates.length - a.dates.length).slice(0, 8);
  if (often.length) {
    root.append(section("Often bought"));
    root.append(h("div.chips", { style: { flexWrap: "wrap" } }, often.map(l => h("button.chip", { onclick: () => db.add("shopping", { item: l.name, done: false, ...(l.store ? { store: l.store } : {}) }) }, "+ " + l.name))));
  }

  if (bought.length) {
    root.append(section("In the cart · " + bought.length));
    root.append(h("div.list", bought.map(s => h("div.row",
      tickBox(true, () => { s.done = false; db.touch(s); db.save("shopping"); }),
      h("div.grow", h("div.title.done", s.item))))));
    root.append(h("div.btnrow", { style: { marginTop: "4px" } },
      btn("Clear bought", { icon: "trash", onclick: () => {
        const removed = bought.slice();
        const list = db.all("shopping");
        for (const s of removed) list.splice(list.indexOf(s), 1);
        db.save("shopping");
        toast(F.plural(removed.length, "item", "items") + " cleared", "Undo", () => { db.all("shopping").push(...removed); db.save("shopping"); });
      } }),
      btn("Book purchase", { icon: "wallet", onclick: bookPurchase })));
  }
}

async function bookPurchase() {
  const total = h("input.field", { inputmode: "decimal", placeholder: "0,00" });
  const shops = [...new Set(["Supermarkt", ...names("shopping", "store")])];
  const shop = h("input.field", { list: "shops-dl", value: shops[0] });
  const body = h("div", h("div.grid2", h("label", h("span.label.caps", "Total (" + F.currency() + ")"), total), h("label", h("span.label.caps", "Shop"), shop)),
    h("datalist", { id: "shops-dl" }, shops.map(s => h("option", { value: s }))));
  const ok = await dialog("Book purchase", body, [{ label: "Cancel", value: false }, { label: "Book it", value: true, main: true }]);
  if (!ok) return;
  const v = F.parseNumber(total.value);
  if (v == null || v <= 0) { toast("Nothing booked - the total wasn't a number"); return; }
  book(shop.value.trim() || "Shopping", -v, "Groceries", F.todayIso());
  toast("Booked " + F.money(v) + " into Money");
}

// ---------------- Meal plan ----------------

function meals(root) {
  const t = F.today();
  week = week || F.mondayOf(t);
  const end = F.addDays(week, 6);
  root.append(h("div.head", { style: { margin: "0 0 10px" } },
    h("button.btn.ghost.small", { html: icon("left", 20), onclick: () => { week = F.addDays(week, -7); go("food/meals"); } }),
    h("div.serif", { style: { flex: "1", textAlign: "center", fontSize: "19px" } }, F.shortDate(week) + " – " + F.shortDate(end)),
    h("button.btn.ghost.small", { html: icon("right", 20), onclick: () => { week = F.addDays(week, 7); go("food/meals"); } }),
    F.mondayOf(t).getTime() === week.getTime() ? null : btn("This week", { small: true, onclick: () => { week = F.mondayOf(t); go("food/meals"); } })));

  for (let i = 0; i < 7; i++) {
    const day = F.addDays(week, i);
    const iso = F.iso(day);
    const planned = db.all("meals").filter(m => m.date === iso).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    const isToday = day.getTime() === t.getTime();
    const card = h("div.card", { style: isToday ? { borderColor: "var(--accent)" } : {} },
      h("div.cardhead", h("h2", h("span" + (isToday ? ".greenc" : ""), F.weekday(day) + " " + F.shortDate(day)), isToday ? h("span.pill", "Today") : null),
        btn("", { kind: "ghost", small: true, icon: "plus", onclick: () => planMeal(iso) })));
    if (!planned.length) card.append(h("div.small.faint", "nothing planned"));
    for (const m of planned) {
      card.append(h("div.row", { onclick: () => mealSheet(m) }, h("span.caps", { style: { width: "72px" } }, m.slot || ""), h("div.grow", h("div.title", m.title))));
    }
    root.append(card);
  }
  root.append(h("div.btnrow", btn("Ingredients → shopping list", { kind: "soft", icon: "cart", onclick: () => ingredientsToList(week, end) })));
}

function ingredientsToList(from, to) {
  let n = 0;
  for (const m of db.all("meals")) {
    const day = d(m, "date");
    if (!day || day < from || day > to || !m.recipe) continue;
    const r = db.byId("recipes", m.recipe);
    for (const i of r?.ingredients || []) {
      const text = (i.text || "").trim();
      if (!text || isStaple(text) || db.all("shopping").some(s => !s.done && (s.item || "").toLowerCase() === text.toLowerCase())) continue;
      db.add("shopping", { item: text, done: false, notes: r.name });
      n++;
    }
  }
  toast(n ? F.plural(n, "ingredient", "ingredients") + " added to the shopping list" : "Everything is on the list already");
}

// Pick a recipe (favourites first) or type anything.
function planMeal(iso) {
  const slot = h("select.field", SLOTS.map(s => h("option", { value: s, selected: s === (new Date().getHours() < 11 ? "Lunch" : "Dinner") }, s)));
  const free = h("input.field", { placeholder: "or type anything: pizza with friends" });
  const recipes = db.all("recipes").slice().sort((a, b) => (b.favorite === true) - (a.favorite === true) || (a.name || "").localeCompare(b.name || ""));
  const s = sheet("Plan " + F.dayDate(F.parseIso(iso)), h("div",
    h("label", h("span.label.caps", "When"), slot),
    h("span.label.caps", "Recipe"),
    recipes.length ? h("div.list", recipes.map(r => h("div.row", { onclick: () => { db.add("meals", { title: r.name, date: iso, slot: slot.value, recipe: r.id }); s.close(); toast(r.name + " planned"); } },
      tile("pot", "--home"), h("div.grow", h("div.title", r.name), h("div.meta", [r.favorite ? "★ favourite" : "", r.minutes ? r.minutes + " min" : ""].filter(Boolean).join(" · ")))))) : h("div.small.muted", "No recipes yet - type a meal below."),
    h("label", h("span.label.caps", "Something else"), free)), {
    actions: [btn("Cancel", { kind: "ghost", onclick: () => s.close() }), btn("Plan it", { kind: "primary", onclick: () => {
      if (!free.value.trim()) { free.focus(); return; }
      db.add("meals", { title: free.value.trim(), date: iso, slot: slot.value });
      s.close();
    } })]
  });
}

function mealSheet(m) {
  const recipe = m.recipe && db.byId("recipes", m.recipe);
  const s = sheet(m.title, h("div.muted", F.dayDate(d(m, "date")) + " · " + (m.slot || "")), {
    actions: [
      recipe ? btn("Open recipe", { kind: "soft", icon: "pot", onclick: () => { s.close(); editRecord("recipes", recipe); } }) : null,
      btn("Edit", { onclick: () => { s.close(); editRecord("meals", m); } }),
      btn("Remove", { kind: "danger", icon: "trash", onclick: () => {
        const i = db.remove("meals", m);
        s.close();
        toast("Removed " + m.title, "Undo", () => { db.all("meals").splice(Math.max(0, i), 0, m); db.save("meals"); });
      } })].filter(Boolean)
  });
}

// ---------------- Recipes ----------------

function recipes(root) {
  const search = h("input.field", { placeholder: "Search recipes", value: recipeSearch, type: "search" });
  search.addEventListener("input", () => { recipeSearch = search.value; drawList(); });
  root.append(h("div.quick", search));
  const listBox = h("div");
  root.append(listBox);
  const drawList = () => {
    listBox.innerHTML = "";
    const q = recipeSearch.toLowerCase();
    const all = db.all("recipes").filter(r => !q || JSON.stringify(r).toLowerCase().includes(q))
      .sort((a, b) => (b.favorite === true) - (a.favorite === true) || (a.name || "").localeCompare(b.name || ""));
    if (!all.length) { listBox.append(empty(db.all("recipes").length ? "No recipe matches." : "Save the recipes you cook - one tap puts the ingredients on the shopping list.")); return; }
    listBox.append(h("div.list", all.map(r => h("div.row", { onclick: () => openRecipe(r) },
      tile("pot", "--home"),
      h("div.grow", h("div.title", (r.favorite ? "★ " : "") + (r.name || "–")), h("div.meta", [r.category, r.minutes ? r.minutes + " min" : "", (r.ingredients || []).length ? (r.ingredients.length + " ingredients") : ""].filter(Boolean).join(" · ")))))));
  };
  drawList();
  root.append(fab(() => newRecord("recipes")));
}

function openRecipe(r) {
  editRecord("recipes", r, { actions: [
    { label: "Ingredients → list", icon: "cart", run: rec => {
      let n = 0;
      for (const i of rec.ingredients || []) {
        const text = (i.text || "").trim();
        if (!text || isStaple(text)) continue;
        db.add("shopping", { item: text, done: false, notes: rec.name });
        n++;
      }
      toast(F.plural(n, "ingredient", "ingredients") + " added to the shopping list");
    } },
    { label: "Plan it", icon: "calendar", run: async rec => {
      const day = h("input.field", { type: "date", value: F.todayIso() });
      const slot = h("select.field", SLOTS.map(s => h("option", { value: s, selected: s === (new Date().getHours() < 11 ? "Lunch" : "Dinner") }, s)));
      const ok = await dialog("Plan " + rec.name, h("div.grid2", h("label", h("span.label.caps", "Day"), day), h("label", h("span.label.caps", "Meal"), slot)),
        [{ label: "Cancel", value: false }, { label: "Plan it", value: true, main: true }]);
      if (ok && day.value) { db.add("meals", { title: rec.name, date: day.value, slot: slot.value, recipe: rec.id }); toast(rec.name + " planned for " + F.dayDate(F.parseIso(day.value))); }
    } }] });
}

