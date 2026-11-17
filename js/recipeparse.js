// Paste a recipe from anywhere (a website like Chefkoch, a chat answer, an Instagram caption) and it's split into
// name, time, portions, ingredients and steps.
// - headings like "Zutaten" / "Ingredients" and "Zubereitung" / "Instructions" (also as "### Zutaten:" or "**Zutaten**")
// - without them, lines that start with an amount ("250 g", "1 EL", "½") are ingredients and the rest are steps
// - cleaned up: Markdown (#, **), bullets and emoji in front, "Rezept drucken" & co., hashtags, nutrition and comments
// - "250 g" on one line and "Nudeln" on the next (copied from a table) become one ingredient: "250 g Nudeln"
// - "Für die Soße:" inside the ingredients is a sub-heading, not something to buy
// - one long paragraph of steps is split into sentences

const ING_HEAD = /^(zutaten|ingredients|du brauchst|you need|einkaufsliste|was du brauchst)\b/i;
const STEP_HEAD = /^(und )?(zubereitung|zubereitungsschritte|zubereiten|anleitung|arbeitsschritte|instructions|directions|method|steps|so geht'?s|so gehts|so wird'?s gemacht|schritte|preparation|how to make( it)?)$/i;
// "Zutaten: 200 g Nudeln, 100 g Pesto" / "Zubereitung: Nudeln kochen …" - heading and content on one line
const ING_INLINE = /^(zutaten|ingredients)(\s+(für|for)\s+[^:]{1,25})?\s*:\s*(.+)$/i;
const STEP_INLINE = /^(zubereitung|anleitung|instructions|directions|method)\s*:\s*(.+)$/i;
// where a recipe ends on a website: nutrition, comments, "more recipes"
const END_HEAD = /^(nährwerte|nährwertangaben|nutrition|kommentare|comments|bewertungen|reviews|das könnte dich auch interessieren|weitere rezepte|more recipes|you might also like)\b/i;
const NOISE = /^(rezept drucken|drucken|print( recipe)?|pin( it)?|teilen|share|speichern|save|merken|zum rezept( springen)?|jump to recipe|werbung|anzeige|video( ansehen)?|bewerten|rate this recipe|zur einkaufsliste|auf die einkaufsliste|add to shopping list|[\d.,]+\s*(sterne|stars|bewertungen|ratings|kommentare|comments)|[★☆⭐].*)$/i;
const UNITS = "g|gr|kg|ml|l|cl|dl|el|tl|esslöffel|teelöffel|tbsp|tsp|cup|cups|oz|lb|stück|stk|dose|dosen|bund|pck|päckchen|packung|prise|prisen|zehe|zehen|scheibe|scheiben|becher|glas|msp|handvoll";
const NUM = "(\\d+([.,/]\\d+)?(\\s*[-–]\\s*\\d+([.,]\\d+)?)?|½|¼|¾|⅓|⅔|⅛|1\\s*½)";
const AMOUNT = new RegExp("^(" + NUM + "|eine?n?|ein paar|etwas|prise|some|a pinch|a few)\\s*(" + UNITS + "|x)?\\.?(\\s|$)", "i");
// a line that is nothing but an amount ("250 g", "1 Dose", "2 EL") - its ingredient is on the next line
const ONLY_AMOUNT = new RegExp("^" + NUM + "\\s*(" + UNITS + ")?\\.?$", "i");
const TIME_WORDS = /(zeit|time|dauer|prep|total|gesamt|insgesamt|ready in|fertig in)/i;

// Takes away what's in front of a line and Markdown: "- ", "• ", "1️⃣ ", "🧅 ", "### ", "**…**".
function clean(line) {
  let s = line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^#{1,6}\s+/, "").replace(/\*\*|__/g, "");   // "## Title" (a "#tag" stays a hashtag)
  s = s.replace(/^(\d)️?⃣\s*/u, "$1. ");                       // 1️⃣ -> "1. "
  s = s.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");      // emoji in front
  s = s.replace(/^[\s\-•*▢☐□◦·–—>✓✔▪►]+/, "").replace(/^\[[ x]\]\s*/i, "");
  return s.replace(/[’‘]/g, "'").trim();
}

const bare = l => l.replace(/\s*\(.*?\)\s*/g, " ").replace(/[:.]\s*$/, "").trim();
const isIngHead = l => ING_HEAD.test(bare(l)) && bare(l).length <= 40;
const isStepHead = l => STEP_HEAD.test(bare(l));
const isHead = l => isIngHead(l) || isStepHead(l);
// "Für die Soße:", "For the sauce:", "Teig:" - a short line ending with ":" and no amount
const isSubHead = l => /:$/.test(l) && l.length <= 40 && !AMOUNT.test(l);
const isStepLabel = l => /^(schritt|step)\s*\d+[:.]?$/i.test(l);
// a numbered line ("1. Eier verquirlen.") or a sentence ("Die Zwiebel würfeln und …") is a step, not something to buy
const isNumbered = l => /^\d+\s*[.)]\s+\S/.test(l);
const looksLikeStep = l => isNumbered(l) || (!AMOUNT.test(l) && (l.length >= 60 || (/[.!]$/.test(l) && l.split(/\s+/).length >= 3)));
const isTimeLine = l => TIME_WORDS.test(l) && /\d+\s*(min|std|stunde|hour|h\b)/i.test(l) && l.length < 60;

// One paragraph of steps -> sentences (only when it's a single long one).
function splitSentences(steps) {
  if (steps.length !== 1 || steps[0].length < 160) return steps;
  return steps[0].split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/).map(s => s.trim()).filter(Boolean);
}

export function parseRecipe(text) {
  const out = { name: "", minutes: null, servings: null, ingredients: [], steps: [] };
  let lines = (text || "").split(/\r?\n/).map(clean).filter(Boolean);
  // stop where the recipe ends (nutrition, comments …), drop "Rezept drucken" & co. and pure hashtag lines
  const end = lines.findIndex((l, i) => i > 2 && END_HEAD.test(l));
  if (end > 0) lines = lines.slice(0, end);
  lines = lines.filter(l => !NOISE.test(l) && !/^(#[\p{L}\p{N}_]+\s*)+$/u.test(l));
  // "250 g" + "Nudeln" on two lines -> "250 g Nudeln" (but not "Portionen" + "2")
  const joined = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], next = lines[i + 1], before = lines[i - 1] || "";
    if (ONLY_AMOUNT.test(l) && next && !ONLY_AMOUNT.test(next) && !AMOUNT.test(next) && !isHead(next)
      && !/^(portionen|personen|servings|serves|zutaten für|for)\b/i.test(before) && !isTimeLine(before)) {
      joined.push(l + " " + next); i++;
    } else joined.push(l);
  }
  lines = joined;
  if (!lines.length) return out;

  const all = lines.join(" ");
  // time: the total ("Gesamtzeit 30 Min") if there is one, else the first time line or the top of the text
  const totalLine = lines.find(l => /(gesamt|total|insgesamt|ready in|fertig in)/i.test(l) && /\d/.test(l));
  const timeText = totalLine || lines.filter((l, i) => i < 3 || TIME_WORDS.test(l)).join(" ");
  const min = timeText.match(/(\d+)\s*(min\b|min\.|minuten|minutes|mins)/i);
  const hours = timeText.match(/(\d+([.,]\d+)?)\s*(std|stunden|stunde|hours?|h)\b/i);
  if (hours) out.minutes = Math.round(parseFloat(hours[1].replace(",", ".")) * 60) + (min ? +min[1] : 0);
  else if (min) out.minutes = +min[1];
  // portions: "4 Portionen", "für 4 Personen", "Portionen: 4", "Portionen" + "2" on the next line, "Serves 4"
  const serv = all.match(/(\d+)\s*(portionen|portion|personen|servings|serves|people)/i)
    || all.match(/(?:portionen|servings|personen|serves|für|for)\s*:?\s*(\d+)\b/i);
  if (serv) out.servings = +serv[1];

  // the name: the first short line that isn't an amount, a heading, a time, a rating or a breadcrumb ("Rezepte > Pasta")
  const startsWithTime = l => /^(arbeitszeit|kochzeit|backzeit|zubereitungszeit|gesamtzeit|wartezeit|ruhezeit|zeit|dauer|prep|cook|total|ready in|fertig in)\b/i.test(l);
  const first = lines.find(l => l.length <= 80 && !AMOUNT.test(l) && !isHead(l) && !startsWithTime(l) && !ING_INLINE.test(l) && !STEP_INLINE.test(l) && !isNumbered(l)
    && !/^\d+\s*(min|portion|person)/i.test(l) && !/[>»›]/.test(l) && !/^(portionen|personen|servings)\b/i.test(l));
  if (first) {
    out.name = first.replace(/\s*\((vegetarisch|vegan|veggie|\d+[^)]*)[^)]*\)/gi, "")
      .replace(/\s*[-–—|,]?\s*(fertig in|in nur|ready in)\s+\d+.*$/i, "").replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
      .replace(/\s{2,}/g, " ").replace(/[:.!]+$/, "").trim();
  }

  let mode = null;
  const hasHeads = lines.some(l => isHead(l) || ING_INLINE.test(l) || STEP_INLINE.test(l));
  const addIngredients = text => { for (const x of text.split(/\s*[,;]\s*(?![^(]*\))/)) if (x.trim()) out.ingredients.push(x.trim().replace(/\s*[.;]$/, "")); };
  for (const l of lines) {
    if (l === first) continue;
    const ingInline = l.match(ING_INLINE);
    if (ingInline && !isIngHead(l)) { addIngredients(ingInline[4]); mode = "ing"; continue; }
    const stepInline = l.match(STEP_INLINE);
    if (stepInline) { out.steps.push(stepInline[2]); mode = "step"; continue; }
    if (isIngHead(l)) { mode = "ing"; continue; }
    if (isStepHead(l)) { mode = "step"; continue; }
    if (/^(\d+)\s*(portionen|personen|servings)\b/i.test(l) || /^(portionen|personen|servings|serves)\s*:?\s*\d*$/i.test(l) || /^\d+$/.test(l)) continue;
    if (isTimeLine(l) || isStepLabel(l)) continue;
    // after the ingredients, the first sentence starts the steps (also without a "Zubereitung" heading)
    if (mode === "ing" && looksLikeStep(l)) mode = "step";
    if (hasHeads || mode) {
      if (mode === "ing") { if (!isSubHead(l)) out.ingredients.push(l.replace(/\s*[.;]$/, "")); }
      else if (mode === "step") out.steps.push(l);
      // before the first heading: an amount line starts the ingredients; intro text and breadcrumbs are left out
      else if (AMOUNT.test(l) && !isNumbered(l) && l.length <= 80) { mode = "ing"; out.ingredients.push(l.replace(/\s*[.;]$/, "")); }
    } else if (isNumbered(l)) {
      out.steps.push(l);
    } else if (AMOUNT.test(l) && l.length <= 80) {
      out.ingredients.push(l);
    } else if (!isSubHead(l)) {
      out.steps.push(l);
    }
  }
  // steps numbered 1, 2, 3 … (their own numbers are taken off first)
  out.steps = splitSentences(out.steps.map(s => s.replace(/^\d+\s*[.)]\s*/, "").trim()).filter(Boolean)).map((s, i) => (i + 1) + ". " + s);
  return out;
}
