import { normalizeForMatch } from "./text";

export type Field =
  | "sku"
  | "parent_sku"
  | "title"
  | "description"
  | "price"
  | "currency"
  | "size"
  | "color"
  | "weight"
  | "notes"
  | "image"
  | "brand"
  | "material"
  | "category";

const SYNONYMS: Record<Field, string[]> = {
  sku: ["sku", "artikelnr", "artikelnummer", "art nr", "artnr", "item no", "item number", "item", "ref", "reference", "référence", "code", "product code", "article number", "article", "ean"],
  parent_sku: ["parent sku", "parent", "group sku", "model number", "model", "modell", "style"],
  title: ["title", "name", "product name", "bezeichnung", "produktname", "artikelbezeichnung", "nom", "désignation", "libellé", "product"],
  description: ["description", "beschreibung", "desc", "details", "produktbeschreibung", "long description", "body html", "body"],
  price: ["price", "preis", "prix", "vk", "vk preis", "vk brutto", "rrp", "uvp", "retail price", "unit price", "selling price", "sales price", "verkaufspreis", "endpreis", "prix de vente", "prix ttc", "tarif"],
  currency: ["currency", "währung", "wahrung", "waehrung", "devise"],
  size: ["size", "größe", "grosse", "groesse", "taille", "dimensions", "dimension", "maße", "masse", "format", "volume", "inhalt"],
  color: ["color", "colour", "farbe", "couleur"],
  weight: ["weight", "gewicht", "poids", "shipping weight"],
  notes: ["notes", "note", "hinweis", "hinweise", "bemerkung", "bemerkungen", "remarks", "comments", "features", "care"],
  image: ["image", "images", "bild", "bilder", "photo", "photos", "foto", "fotos", "picture", "image file", "image url", "filename"],
  brand: ["brand", "marke", "hersteller", "marque", "manufacturer", "vendor"],
  material: ["material", "matériau", "materiau", "werkstoff"],
  category: ["category", "kategorie", "catégorie", "categorie", "warengruppe", "product type"],
};

const LOOKUP = new Map<string, Field>();
for (const [field, words] of Object.entries(SYNONYMS) as [Field, string[]][]) {
  for (const word of words) LOOKUP.set(normalizeForMatch(word), field);
}

export function matchHeader(cell: string): Field | null {
  const key = normalizeForMatch(cell);
  if (!key) return null;
  return LOOKUP.get(key) ?? LOOKUP.get(key.replace(/\s+/g, "")) ?? null;
}

export interface HeaderInfo {
  index: number;
  names: string[];
  fields: (Field | null)[];
}

export function detectHeader(rows: string[][], scan = 20): HeaderInfo | null {
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const fields = rows[i].map(matchHeader).filter(Boolean);
    const score = new Set(fields).size;
    if (score >= 2 && (!best || score > best.score)) best = { index: i, score };
  }
  if (!best) return null;

  const raw = rows[best.index];
  const seen = new Map<string, number>();
  const names = raw.map((cell, i) => {
    const base = cell.trim() || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  const taken = new Set<Field>();
  const fields = raw.map((cell) => {
    const field = matchHeader(cell);
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
  if (!taken.has("price")) {
    const column = inferPriceColumn(rows.slice(best.index + 1, best.index + 201), raw, fields);
    if (column !== null) fields[column] = "price";
  }
  return { index: best.index, names, fields };
}

const PURCHASE = /\b(ek|einkauf\w*|cost|costs|purchase|wholesale|achat|prix d achat)\b/;
const MONEY = /([€£$]|\b(eur|gbp|usd|chf)\b)\s*\d|\d\s*([€£$]|\b(eur|gbp|usd|chf)\b)/i;

function inferPriceColumn(sample: string[][], header: string[], fields: (Field | null)[]): number | null {
  let best: { column: number; share: number } | null = null;
  for (let c = 0; c < header.length; c++) {
    if (fields[c] || PURCHASE.test(normalizeForMatch(header[c]))) continue;
    const values = sample.map((r) => (r[c] ?? "").trim()).filter(Boolean);
    if (values.length < 3) continue;
    const share = values.filter((v) => MONEY.test(v)).length / values.length;
    if (share >= 0.8 && (!best || share > best.share)) best = { column: c, share };
  }
  return best?.column ?? null;
}
