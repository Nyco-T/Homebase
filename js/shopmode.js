// Shopping mode: the list full screen while you're in the shop - sorted by aisle, big ticks, a price field per item,
// a running total and "Finish" to book what you paid. The screen stays on meanwhile.
// Automation: items find their aisle by themselves (milk -> fridge), known prices are filled in, and the prices you
// type are learned for next time (and for what your recipes cost).

import * as db from "./db.js";
import * as F from "./fmt.js";
import { h, icon, btn, toast, sheet, calm } from "./ui.js";
import { book, accounts, accountIcon } from "./kinds.js";
import { calcField } from "./form.js";
import { priceOf, setPrice } from "./cook.js";
import * as auto from "./auto.js";

export const AISLES = [
  ["🥬", "Fruit and veg", /tomat|gurke|paprika|salat|spinat|zwiebel|knoblauch|kartoffel|banane|apfel|äpfel|birne|zitrone|limette|avocado|karotte|möhre|brokkoli|zucchini|pilz|champignon|beere|obst|gemüse|kräuter|petersilie|basilikum|ingwer|lauch|kohl|aubergine|orange|traube|mango|kiwi|rucola|radieschen|sellerie|kürbis|tomato|cucumber|pepper|lettuce|spinach|onion|garlic|potato|banana|apple|lemon|carrot|mushroom|fruit|veg|herb/i],
  ["🥖", "Bread", /brot|brötchen|toast|baguette|wrap|tortilla|croissant|bagel|semmel|bread|roll/i],
  ["🧀", "Fridge", /milch|joghurt|jogurt|quark|käse|feta|mozzarella|parmesan|butter|sahne|\beier?\b|schmand|frischkäse|tofu|hafermilch|skyr|gnocchi|halloumi|margarine|hummus|milk|yog|cheese|cream|\beggs?\b/i],
  ["🧊", "Frozen", /\btk\b|tiefkühl|pizza|\beis\b|frozen|ice cream|pommes/i],
  ["🍝", "Pantry", /nudel|pasta|spaghetti|penne|reis|mehl|zucker|olivenöl|(^|\s)öl(\s|$)|essig|linsen|bohnen|kichererbsen|dose|tomatenmark|passata|gewürz|salz|pfeffer|brühe|müsli|haferflocken|cornflakes|honig|marmelade|nüsse|kaffee|\btee\b|kakao|pesto|sauce|soße|couscous|bulgur|quinoa|schoko|chips|kekse|rice|flour|sugar|\boil\b|beans|lentil|spice|cereal|oats|coffee|\btea\b|snack/i],
  ["🥤", "Drinks", /wasser|saft|cola|bier|wein|limo|sprudel|mate|getränk|water|juice|beer|wine|drink/i],
  ["🧴", "Drugstore", /zahnpasta|zahnbürste|shampoo|duschgel|deo|klopapier|toilettenpapier|küchenrolle|spülmittel|waschmittel|seife|taschentücher|müllbeutel|schwamm|creme|rasier|toothpaste|soap|tissue|detergent/i],
];
// a few that would land in the wrong aisle by their first word (Tomatenmark isn't veg, Orangensaft isn't fruit)
const FIRST = [[6, /zahnpasta|zahnbürste|toothpaste|duschgel|shampoo/i], [4, /tomatenmark|passata|stückige tomaten|dosentomaten|konserve|pesto|tomatensauce|tomatensoße|ketchup|kokosmilch|getrocknete/i],
  [3, /tk-|tiefkühl|\btk\b|pizza|frozen/i], [5, /saft|juice|smoothie/i]];
export function aisleOf(item) {
  const text = item || "";
  for (const [i, re] of FIRST) if (re.test(text)) return i;
  return AISLES.findIndex(([, , re]) => re.test(text));
}

// The price an item probably costs: what you typed for it, else what it cost last time.
export const priceFor = s => typeof s.price === "number" && s.price > 0 ? s.price : (priceOf(s.item || "")?.price ?? null);

let wake = null;
async function keepAwake() {
  try { if (navigator.wakeLock && document.visibilityState === "visible") wake = await navigator.wakeLock.request("screen"); } catch (e) { /* not supported */ }
}

export function open() {
  const box = h("div.shopmode");
  const list = h("div");
  const totalEl = h("div.serif", { style: { fontSize: "21px" } });
  const countEl = h("div.small.muted");
  const prog = h("div", { style: { height: "5px", width: "0%", background: "var(--accent)", borderRadius: "3px", transition: "width .3s" } });
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => db.save("shopping"), 400); };

  // The items on the list: everything not bought yet, plus what's already in the cart (ticked).
  const items = () => db.all("shopping").filter(s => s.item);
  const totals = () => {
    const all = items(), inCart = all.filter(s => s.done);
    const sum = inCart.reduce((a, s) => a + (priceFor(s) || 0), 0);
    countEl.textContent = inCart.length + " of " + all.length + " in the cart";
    prog.style.width = (all.length ? inCart.length / all.length * 100 : 0) + "%";
    totalEl.textContent = "≈ " + F.money(sum);
    return { all, inCart, sum };
  };

  const draw = () => {
    list.innerHTML = "";
    const groups = new Map();
    for (const s of items()) {
      const a = aisleOf(s.item);
      const key = a < 0 ? AISLES.length : a;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    for (const key of [...groups.keys()].sort((a, b) => a - b)) {
      const [emoji, name] = AISLES[key] || ["📦", "Other"];
      const rows = groups.get(key).sort((a, b) => (a.done === true) - (b.done === true) || (a.item || "").localeCompare(b.item || ""));
      list.append(h("div.section", h("span.caps", emoji + " " + name)));
      list.append(h("div.list", rows.map(s => {
        const known = priceFor(s);
        const price = h("input.field.shopprice", { inputmode: "decimal", placeholder: known ? F.plainAmount(known) : "€", value: typeof s.price === "number" && s.price > 0 ? F.plainAmount(s.price) : "" });
        price.addEventListener("click", e => e.stopPropagation());
        price.addEventListener("input", () => {
          const v = F.parseAmount(price.value);
          if (!price.value.trim()) delete s.price; else if (v != null && v >= 0) s.price = v;
          db.touch(s); save(); totals();
        });
        const tick = h("span.bigtick", { html: s.done ? icon("tick", 18) : "" });
        const row = h("div.row.shoprow" + (s.done ? ".got" : ""), { onclick: () => {
          s.done = !s.done; db.touch(s); save();
          if (!calm() && s.done) { tick.classList.add("pop"); tick.innerHTML = icon("tick", 18); row.classList.add("got"); setTimeout(() => { draw(); totals(); }, 220); }
          else { draw(); totals(); }
        } }, tick, h("div.grow", h("div.title", s.item), s.qty ? h("div.meta", s.qty) : null), price);
        return row;
      })));
    }
    if (!items().length) list.append(h("div.empty", "Your list is empty."));
  };

  const close = () => {
    clearTimeout(saveTimer); db.save("shopping");
    try { wake && wake.release(); } catch (e) { /* already gone */ }
    wake = null;
    document.removeEventListener("visibilitychange", onVisible);
    box.remove();
  };
  const onVisible = () => { if (document.visibilityState === "visible" && box.isConnected) keepAwake(); };
  document.addEventListener("visibilitychange", onVisible);

  box.append(
    h("div.shophead",
      h("button.btn.ghost.small", { onclick: close, html: icon("x", 18) + " Close" }),
      h("span.pill", "screen stays on")),
    h("h1.serif", { style: { fontSize: "28px", margin: "6px 0 2px" } }, "Shopping"),
    countEl, h("div", { style: { height: "5px", background: "var(--track)", borderRadius: "3px", margin: "8px 0 4px", overflow: "hidden" } }, prog),
    list,
    h("div.shopbar", h("div", { style: { flex: "1" } }, h("div.caps", "In the cart"), totalEl),
      btn("Finish", { kind: "primary", onclick: () => finish(totals(), close) })));
  draw();
  totals();
  document.body.append(box);
  keepAwake();
}

// "Done shopping": what you paid (Homebase's guess filled in), Bank or Cash, the shop - booked as Groceries.
// The bought items leave the list; what you didn't get stays for next time.
function finish({ all, inCart, sum }, closeMode) {
  if (!inCart.length) { toast("Tick what's in your cart first"); return; }
  const amount = h("input.field", { inputmode: "decimal", value: sum > 0 ? F.plainAmount(sum) : "", placeholder: "0,00", style: { fontSize: "24px", textAlign: "center" } });
  const stores = [...new Set(inCart.map(s => s.store).filter(Boolean))];
  const shop = h("input.field", { value: stores[0] || db.setting("lastShop", "") || "Supermarkt", list: "shop-dl" });
  let account = accounts().includes("Bank") ? "Bank" : accounts()[0];
  const accBox = h("div.chips", { style: { flexWrap: "wrap", marginTop: "8px" } });
  const drawAcc = () => { accBox.innerHTML = ""; for (const a of accounts()) accBox.append(h("button.chip" + (a === account ? ".on" : ""), { type: "button", onclick: () => { account = a; drawAcc(); } }, accountIcon(a) + " " + a)); };
  drawAcc();
  const left = all.length - inCart.length;
  const s = sheet("Done shopping 🎉", h("div",
    h("div.small.muted", inCart.length + (inCart.length === 1 ? " item" : " items") + " in the cart" + (left ? " · " + left + " left on the list" : "")),
    h("label", h("span.label.caps", "What did you pay?"), calcField(amount)),
    sum > 0 ? h("div.small.muted", "Homebase guessed ≈ " + F.money(sum) + " from the prices it knows") : null,
    accBox,
    h("label", h("span.label.caps", "Shop"), shop),
    h("datalist", { id: "shop-dl" }, [...new Set(["Supermarkt", "REWE", "Aldi", "Lidl", "Edeka", "dm", ...db.all("transactions").filter(t => t.category === "Groceries").map(t => t.description)])].slice(0, 12).map(x => h("option", { value: x })))), {
    actions: [
      btn("Just close", { kind: "ghost", onclick: () => { s.close(); closeMode(); } }),
      btn("Book it", { kind: "primary", onclick: () => {
        const v = F.parseAmount(amount.value);
        if (v == null || v <= 0) { toast("Type what you paid"); return; }
        const where = shop.value.trim() || "Supermarkt";
        db.setSetting("lastShop", where);
        auto.run();   // learn the bought items before they leave the list
        for (const x of inCart) if (typeof x.price === "number" && x.price > 0) setPrice(x.item.trim(), x.price);   // and every price you typed
        const e = book(where, -v, "Groceries", F.todayIso());
        if (account !== "Bank") { e.account = account; db.touch(e); db.save("transactions"); }
        const removed = inCart.slice();
        const shopping = db.all("shopping");
        for (const x of removed) { const i = shopping.indexOf(x); if (i >= 0) shopping.splice(i, 1); }
        db.save("shopping");
        s.close(); closeMode();
        toast("Booked " + F.money(v) + " · " + where, "Undo", () => { db.remove("transactions", e); db.all("shopping").push(...removed); db.save("shopping"); });
      } })] });
}
