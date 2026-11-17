// Paste a recipe from anywhere (a website, a chat) and it's split into name, time, portions, ingredients and steps.
// Looks for headings like "Zutaten" / "Ingredients" and "Zubereitung" / "Instructions"; without them, lines that
// start with an amount ("250 g", "1 EL", "½") count as ingredients and the rest as steps.

const ING_HEAD = /^(zutaten|ingredients|du brauchst|you need|einkaufsliste)\b/i;
const STEP_HEAD = /^(zubereitung|anleitung|instructions|directions|method|steps|so geht'?s|schritte)\b/i;
const BULLET = /^[\s\-•*▢☐□◦·–—]+/;
const AMOUNT = /^(\d+([.,/]\d+)?|½|¼|¾|⅓|⅔|eine?n?|ein paar|etwas|prise|some|a pinch|a few)\s*(g|kg|ml|l|el|tl|esslöffel|teelöffel|tbsp|tsp|cup|cups|stück|stk|dose|dosen|bund|pck|packung|prise|zehe|zehen|scheibe|scheiben|x)?\b/i;

export function parseRecipe(text) {
  const lines = (text || "").split(/\r?\n/).map(l => l.replace(BULLET, "").trim()).filter(Boolean);
  const out = { name: "", minutes: null, servings: null, ingredients: [], steps: [] };
  if (!lines.length) return out;

  const all = lines.join(" ");
  // time only from lines about time, or the top of the text (not "fry 5 minutes" inside a step)
  const timeText = lines.filter((l, i) => i < 3 || /(zeit|time|dauer|prep|total|gesamt|insgesamt|ready in|fertig in)/i.test(l)).join(" ");
  const min = timeText.match(/(\d+)\s*(min\b|minuten|minutes|mins)/i);
  if (min) out.minutes = +min[1];
  const hours = timeText.match(/(\d+)\s*(std|stunden|hours?|h)\b/i);
  if (!min && hours) out.minutes = +hours[1] * 60;
  const serv = all.match(/(\d+)\s*(portionen|portion|personen|servings|serves|people)/i) || all.match(/(?:für|for|serves)\s*(\d+)/i);
  if (serv) out.servings = +serv[1];

  // the name: the first short line that isn't an amount, a heading or a time
  const first = lines.find(l => l.length <= 70 && !AMOUNT.test(l) && !ING_HEAD.test(l) && !STEP_HEAD.test(l) && !/\d+\s*(min|portion|person)/i.test(l));
  if (first) out.name = first.replace(/[:.]$/, "");

  let mode = null;
  const hasHeads = lines.some(l => ING_HEAD.test(l)) || lines.some(l => STEP_HEAD.test(l));
  for (const l of lines) {
    if (l === first) continue;
    if (ING_HEAD.test(l)) { mode = "ing"; continue; }
    if (STEP_HEAD.test(l)) { mode = "step"; continue; }
    if (/^(\d+)\s*(portionen|personen|servings)/i.test(l) || /^(zeit|time|dauer|prep|cook)\b/i.test(l)) continue;
    if (hasHeads) {
      if (mode === "ing") out.ingredients.push(l);
      else if (mode === "step") out.steps.push(l);
    } else if (AMOUNT.test(l) && l.length <= 80) {
      out.ingredients.push(l);
    } else {
      out.steps.push(l);
    }
  }
  // numbered steps keep their number, others get one
  out.steps = out.steps.map((s, i) => /^\d+[.)]/.test(s) ? s : (i + 1) + ". " + s);
  return out;
}
