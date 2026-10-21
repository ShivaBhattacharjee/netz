import type { GroupInput } from "../pipeline/group";
import { htmlToText, normalizeForMatch } from "../pipeline/text";

export interface RawClaim {
  text: string;
  source_row: number;
  source_column: string;
  quote: string;
}

export interface VerifiedClaims {
  kept: { text: string; source: string }[];
  rejected: { text: string; reason: string }[];
}

const NEGATION = /\b(not|no|non|never|without|nicht|kein|keine|keinen|ohne|pas|sans)\b/;

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cellText(group: GroupInput, row: number, column: string) {
  const r = group.rows.find((x) => x.row === row);
  if (!r) return null;
  const key = Object.keys(r.cells).find((k) => k.toLowerCase() === column.trim().toLowerCase());
  return key ? { column: key, text: htmlToText(r.cells[key]) } : null;
}

function contradicted(claim: string, cell: string) {
  const phrase = normalizeForMatch(claim);
  if (!phrase || NEGATION.test(phrase)) return false;
  return new RegExp(`\\b(not|no|never|nicht|kein|keine|pas|sans|without|ohne)\\s+${escapeRe(phrase)}\\b`).test(normalizeForMatch(cell));
}

export function verifyClaims(group: GroupInput, claims: RawClaim[]): VerifiedClaims {
  const kept: VerifiedClaims["kept"] = [];
  const rejected: VerifiedClaims["rejected"] = [];
  for (const c of claims) {
    const cell = cellText(group, c.source_row, c.source_column);
    if (!cell) {
      rejected.push({ text: c.text, reason: `cites row ${c.source_row}, column ${c.source_column}, which is not in this product` });
      continue;
    }
    const quote = normalizeForMatch(c.quote);
    if (!quote || !normalizeForMatch(cell.text).includes(quote)) {
      rejected.push({ text: c.text, reason: `quote not found in row ${c.source_row}, column ${cell.column}` });
      continue;
    }
    if (contradicted(c.text, cell.text)) {
      rejected.push({ text: c.text, reason: `the source says the opposite (row ${c.source_row}, column ${cell.column})` });
      continue;
    }
    if (!kept.some((k) => normalizeForMatch(k.text) === normalizeForMatch(c.text))) {
      kept.push({ text: c.text, source: `row ${c.source_row}, column ${cell.column}` });
    }
  }
  return { kept, rejected };
}

const RISKY_TERMS: { term: string; variants: string[] }[] = [
  { term: "organic", variants: ["organic", "bio", "biologique"] },
  { term: "eco-friendly", variants: ["eco friendly", "eco", "umweltfreundlich", "ecologique"] },
  { term: "sustainable", variants: ["sustainable", "nachhaltig", "durable"] },
  { term: "non-toxic", variants: ["non toxic", "ungiftig", "non toxique"] },
  { term: "BPA-free", variants: ["bpa free", "bpa frei"] },
  { term: "certified", variants: ["certified", "zertifiziert", "certifie", "oeko tex", "fsc", "gots"] },
  { term: "fair trade", variants: ["fair trade", "fairtrade", "fair gehandelt", "commerce equitable"] },
  { term: "waterproof", variants: ["waterproof", "wasserdicht", "etanche"] },
  { term: "weatherproof", variants: ["weatherproof", "wetterfest"] },
  { term: "frost-proof", variants: ["frost proof", "frostfest", "frostsicher"] },
  { term: "microwave-safe", variants: ["microwave safe", "mikrowellengeeignet", "mikrowellenfest"] },
  { term: "dishwasher-safe", variants: ["dishwasher safe", "spulmaschinenfest", "spulmaschinengeeignet", "lave vaisselle"] },
  { term: "machine washable", variants: ["machine washable", "waschmaschinenfest", "lavable en machine"] },
  { term: "handmade", variants: ["handmade", "hand made", "handgemacht", "fait main", "handcrafted"] },
  { term: "vegan", variants: ["vegan", "vegane"] },
  { term: "recycled", variants: ["recycled", "recycelt", "recycle"] },
  { term: "hypoallergenic", variants: ["hypoallergenic", "hypoallergen"] },
  { term: "dimmable", variants: ["dimmable", "dimmbar"] },
  { term: "bulb included", variants: ["bulb included", "includes bulb", "inkl leuchtmittel", "mit leuchtmittel"] },
];

function containsWord(haystack: string, needle: string) {
  return new RegExp(`(^|\\s)${escapeRe(needle)}(\\s|$)`).test(haystack);
}

export function unsupportedTerms(group: GroupInput, output: string, claims: { text: string }[]) {
  const source = normalizeForMatch(group.rows.map((r) => Object.values(r.cells).map(htmlToText).join(" ")).join(" "));
  const out = normalizeForMatch(output);
  const claimed = normalizeForMatch(claims.map((c) => c.text).join(" "));
  const found: string[] = [];
  for (const { term, variants } of RISKY_TERMS) {
    const inOutput = variants.some((v) => containsWord(out, normalizeForMatch(v)));
    if (!inOutput) continue;
    const negatedInOutput = variants.some((v) => new RegExp(`\\b(not|no|non)\\s+${normalizeForMatch(v)}`).test(out));
    if (negatedInOutput) continue;
    const supported = variants.some((v) => containsWord(source, normalizeForMatch(v)) || containsWord(claimed, normalizeForMatch(v)));
    if (!supported) found.push(term);
  }
  return found;
}
