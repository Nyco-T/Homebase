// "What can I cook?" - matches what you have against your recipes' ingredients.
// Automation: your "Always at home" items and what you bought in the last 7 days count as at home by themselves.

import * as db from "./db.js";
import * as F from "./fmt.js";
import { isStaple } from "./rules.js";

const words = text => (text || "").toLowerCase().split(/[^a-zäöüß]+/).filter(w => w.length >= 3);

// What you probably have: bought in the last 7 days (ticked in the cart or logged), newest first.
export function recentlyBought() {
  const since = F.iso(F.addDays(F.today(), -7));
  const out = new Set();
  for (const s of db.all("shopping")) if (s.done && s.item) out.add(s.item.trim());
  for (const l of db.all("buylog")) if ((l.dates || []).some(d => d >= since) && l.name) out.add(l.name.trim());
  return [...out];
}

// One ingredient counts as there when one of your words is in it ("Nudeln" in "250 g Nudeln (Penne …)"),
// or when it's something always at home.
function have(ingredient, haveWords) {
  if (isStaple(ingredient)) return true;
  const ing = ingredient.toLowerCase();
  return haveWords.some(w => ing.includes(w)) || words(ingredient).some(w => haveWords.some(h => h.includes(w)));
}

// Every recipe with how much of it you have: [{recipe, have, total, missing[]}], best first.
export function match(haveText) {
  const haveWords = haveText.split(/[,\n]/).flatMap(words);
  const out = [];
  for (const r of db.all("recipes")) {
    const ings = (r.ingredients || []).map(i => (i.text || "").trim()).filter(Boolean);
    if (!ings.length) continue;
    const missing = ings.filter(i => !have(i, haveWords));
    const real = ings.filter(i => !isStaple(i));
    const got = real.length - missing.length;
    if (haveWords.length && got <= 0) continue;
    out.push({ recipe: r, have: got, total: real.length, missing });
  }
  return out.sort((a, b) => (b.have / Math.max(1, b.total)) - (a.have / Math.max(1, a.total)) || a.missing.length - b.missing.length);
}

// ---------------- What a recipe costs ----------------
// Prices come from your shopping list (an item with a price, once it's bought - learned by itself) and from
// "Prices" on a recipe. They're package prices, so a recipe's cost is a rough "≈".

const AMOUNT = /^(\d+([.,/]\d+)?|½|¼|¾|⅓|⅔|eine?n?|ein paar|etwas|prise)\s*(g|kg|ml|l|el|tl|esslöffel|teelöffel|stück|stk|dose|dosen|bund|pck|packung|prise|zehe|zehen|scheibe|scheiben|tbsp|tsp|cup|cups|x)?\.?\s+/i;

// "200 g Feta (gewürfelt)" -> "Feta"
export function coreName(ingredient) {
  const s = (ingredient || "").replace(/\(.*?\)/g, "").replace(AMOUNT, "").replace(/,.*$/, "").trim();
  return s || (ingredient || "").trim();
}

// The known price that fits an ingredient best (the longest matching name), or null.
export function priceOf(ingredient) {
  const ing = (ingredient || "").toLowerCase();
  const ingWords = words(ingredient);
  let best = null;
  for (const l of db.all("buylog")) {
    if (typeof l.price !== "number" || !(l.price > 0)) continue;
    const name = (l.name || l.item || "").toLowerCase().trim();
    if (!name) continue;
    if (ing.includes(name) || words(name).some(w => ingWords.includes(w))) {
      if (!best || name.length > best.name.length) best = { name, price: l.price, date: l.priceDate || "" };
    }
  }
  return best;
}

export function setPrice(name, price) {
  const item = (name || "").trim().toLowerCase();
  if (!item) return;
  let log = db.all("buylog").find(r => r.item === item);
  if (!log) { log = { id: db.newId(), created: db.stamp(), item, name: name.trim(), dates: [] }; db.all("buylog").push(log); }
  if (price == null) delete log.price; else { log.price = price; log.priceDate = F.todayIso(); }
  log.updated = db.stamp();
  db.save("buylog");
}

// { total, perServing (null without servings), priced, of, missing[] } - oil, salt & co. don't count.
// A spoonful or a pinch (2 EL Olivenöl, 1 TL Kreuzkümmel) is a tiny part of a pack - it doesn't count either.
const SPOONFUL = /^(\d+([.,/]\d+)?|½|¼|¾|ein|eine|etwas|1\/2)?\s*(el|tl|esslöffel|teelöffel|prise|prisen|msp|messerspitze|tbsp|tsp|pinch)\b/i;
export const pricedIngredients = r => (r.ingredients || []).map(i => (i.text || "").trim()).filter(t => t && !isStaple(t) && !SPOONFUL.test(t) && !/^(etwas|some|a pinch|prise)\b/i.test(t));

export function recipeCost(r) {
  const ings = pricedIngredients(r);
  let total = 0, priced = 0;
  const missing = [];
  for (const i of ings) { const p = priceOf(i); if (p) { total += p.price; priced++; } else missing.push(i); }
  const servings = Number(r.servings) > 0 ? Number(r.servings) : null;
  return { total, perServing: servings ? total / servings : null, priced, of: ings.length, missing };
}

export function costLabel(c, short = false) {
  if (!c || !c.priced) return "";
  const main = "≈ " + F.money(c.perServing ?? c.total) + (c.perServing != null ? (short ? "/serving" : " per serving") : (short ? "" : " in total"));
  return main + (c.priced < c.of ? " (" + c.priced + "/" + c.of + " priced)" : "");
}
