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

type Quoted = { source_row: number; source_column: string; quote: string };

function findQuote(group: GroupInput, q: Quoted): { error: string } | { column: string; text: string; source: string } {
  const cell = cellText(group, q.source_row, q.source_column);
  if (!cell) return { error: `cites row ${q.source_row}, column ${q.source_column}, which is not in this product` };
  const quote = normalizeForMatch(q.quote);
  if (!quote || !normalizeForMatch(cell.text).includes(quote)) return { error: `quote not found in row ${q.source_row}, column ${cell.column}` };
  return { ...cell, source: `row ${q.source_row}, column ${cell.column}` };
}

export function verifyClaims(group: GroupInput, claims: RawClaim[]): VerifiedClaims {
  const kept: VerifiedClaims["kept"] = [];
  const rejected: VerifiedClaims["rejected"] = [];
  for (const c of claims) {
    const found = findQuote(group, c);
    if ("error" in found) {
      rejected.push({ text: c.text, reason: found.error });
      continue;
    }
    if (contradicted(c.text, found.text)) {
      rejected.push({ text: c.text, reason: `the source says the opposite (${found.source})` });
      continue;
    }
    if (!kept.some((k) => normalizeForMatch(k.text) === normalizeForMatch(c.text))) {
      kept.push({ text: c.text, source: found.source });
    }
  }
  return { kept, rejected };
}

export interface RawAttribute extends Quoted {
  key: string;
  value: string;
}

export function verifyAttributes(group: GroupInput, attributes: RawAttribute[]) {
  const kept: RawAttribute[] = [];
  const rejected: { attribute: RawAttribute; reason: string }[] = [];
  for (const a of attributes) {
    const found = findQuote(group, a);
    if ("error" in found) rejected.push({ attribute: a, reason: found.error });
    else if (contradicted(a.value, found.text)) rejected.push({ attribute: a, reason: `the source says the opposite (${found.source})` });
    else kept.push(a);
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
