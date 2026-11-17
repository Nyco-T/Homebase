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
