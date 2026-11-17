// Colours and icons for money categories. Known names (German or English) get their own; any other category gets a
// steady colour from the palette (the same name always the same colour) and a tag.

const KNOWN = [
  [/lebensmittel|groceries|supermarkt|einkauf|food shop|rewe|aldi|lidl|edeka|netto|penny|kaufland/i, "🛒", "#5FA36A"],
  [/restaurant|essen gehen|eating|lunch|mittag|mensa|döner|lieferando|imbiss|caf[eé]|kaffee|coffee|takeaway|bäcker/i, "🍽️", "#E08A5E"],
  [/transport|öpnv|bahn|bus\b|ticket|deutschlandticket|auto|benzin|tanken|fahrrad|bike|uber|taxi|travel card/i, "🚆", "#5B8FD6"],
  [/miete|rent|wohnen|wg|nebenkosten|strom|gas\b|internet|housing/i, "🏠", "#D9A05B"],
  [/fun|freizeit|kino|cinema|party|concert|konzert|spiel|game|hobby|ausgehen|bar\b/i, "🎉", "#9D7FD8"],
  [/sport|gym|fitness|verein/i, "🏋️", "#5BB3A0"],
  [/kleidung|clothes|clothing|shopping|h&m|zalando|schuhe|shoes|mode\b/i, "👕", "#D97BA6"],
  [/gesundheit|health|apotheke|arzt|doctor|pharmacy/i, "💊", "#4FB0A8"],
  [/drogerie|dm\b|rossmann|hygiene|kosmetik/i, "🧴", "#C98BC9"],
  [/handy|phone|mobile|vertrag/i, "📱", "#7C8FA6"],
  [/abo|subscription|netflix|spotify|streaming|disney|prime/i, "📺", "#C46B6B"],
  [/gehalt|salary|income|lohn|einkommen|ausbildung|wage/i, "💶", "#4F9F5C"],
  [/paid back|zurück|refund|erstattung/i, "↩️", "#6FA88F"],
  [/geschenk|gift|present/i, "🎁", "#D4708A"],
  [/urlaub|reise|holiday|vacation|hotel|flug|flight/i, "✈️", "#4FA3C7"],
  [/bildung|schule|education|bücher|books|kurs|course|uni/i, "📚", "#8F86C9"],
  [/sparen|savings|transfer|umbuchung/i, "🐷", "#B59A5A"],
  [/versicherung|insurance/i, "🛡️", "#8A98B5"],
  [/haushalt|household|möbel|furniture|ikea/i, "🧺", "#B08F6A"],
];
const PALETTE = ["#5FA36A", "#5B8FD6", "#E08A5E", "#9D7FD8", "#D9A05B", "#D97BA6", "#4FB0A8", "#C46B6B", "#7C8FA6", "#B59A5A", "#4FA3C7", "#8F86C9"];

const cache = new Map();

// { emoji, color } for a category name
export function catStyle(name) {
  const key = (name || "Other").trim();
  if (cache.has(key)) return cache.get(key);
  let style = null;
  for (const [re, emoji, color] of KNOWN) if (re.test(key)) { style = { emoji, color }; break; }
  if (!style) {
    let hash = 0;
    for (const ch of key.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    style = { emoji: /^(other|sonstiges|andere)$/i.test(key) ? "🧾" : "🏷️", color: PALETTE[hash % PALETTE.length] };
  }
  cache.set(key, style);
  return style;
}
