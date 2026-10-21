import type { FieldScores } from "@/db/schema";
import type { BuiltProduct } from "../ai/build";
import type { GroupInput } from "../pipeline/group";
import { htmlToText, normalizeForMatch } from "../pipeline/text";
import type { LabelProduct, Labels } from "./sets";

const MAX_NOTES = 200;

function add(scores: FieldScores, field: string, ok: boolean) {
  const s = (scores[field] ??= { correct: 0, total: 0 });
  s.total += 1;
  if (ok) s.correct += 1;
}

function sameSet<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function sameOptions(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => normalizeForMatch(a[k] ?? "") === normalizeForMatch(b[k]));
}

function claimMatches(got: string, want: string) {
  const g = normalizeForMatch(got);
  const w = normalizeForMatch(want);
  if (!g || !w) return false;
  if (g.includes(w) || w.includes(g)) return true;
  const gw = new Set(g.split(" "));
  const ww = w.split(" ").filter((t) => t.length > 2);
  return ww.length > 0 && ww.filter((t) => gw.has(t)).length / ww.length >= 0.6;
}

function mentions(text: string, term: string) {
  const t = normalizeForMatch(term);
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text) && !new RegExp(`\\b(not|no|non)\\s+${escaped}`).test(text);
}

export function scoreCleaning(groups: GroupInput[], labels: Labels, scores: FieldScores, notes: string[]) {
  const byKey = new Map(groups.map((g) => [g.group_key, g]));
  const canonical = new Map<number, number>();
  for (const d of [...(labels.duplicate_rows ?? []), ...labels.products.flatMap((p) => p.duplicate_rows ?? [])]) canonical.set(d.row, d.duplicate_of);
  const rows = (list: number[]) => list.map((r) => canonical.get(r) ?? r);

  for (const label of labels.products) {
    const group = byKey.get(label.group);
    const grouped = !!group && sameSet(rows(group.source_rows), rows(label.source_rows));
    add(scores, "grouping", grouped);
    if (!grouped && notes.length < MAX_NOTES) notes.push(`${label.group}: rows ${group?.source_rows.join(",") ?? "missing"} ≠ ${label.source_rows.join(",")}`);
    if (!group) continue;

    add(scores, "variants.sku", sameSet(group.variants.map((v) => v.sku), label.variants.map((v) => v.sku)));
    const want = new Map(label.variants.map((v) => [v.sku, v]));
    for (const v of group.variants) {
      const w = want.get(v.sku);
      if (!w) continue;
      const checks: [string, boolean, unknown, unknown][] = [
        ["variants.price_cents", v.price_cents === w.price_cents, v.price_cents, w.price_cents],
        ["variants.currency", v.currency === w.currency, v.currency, w.currency],
        ["variants.weight_grams", v.weight_grams === w.weight_grams, v.weight_grams, w.weight_grams],
        ["variants.options", sameOptions(v.options, w.options), JSON.stringify(v.options), JSON.stringify(w.options)],
      ];
      for (const [field, ok, got, expected] of checks) {
        add(scores, field, ok);
        if (!ok && notes.length < MAX_NOTES) notes.push(`${v.sku}: ${field.split(".")[1]} ${String(got)} ≠ ${String(expected)}`);
      }
    }
  }
}

export function scoreBuild(built: BuiltProduct | null, label: LabelProduct, scores: FieldScores, notes: string[]) {
  if (!built) {
    for (const field of ["category", "status", ...Object.keys(label.attributes).map((k) => `attributes.${k}`)]) add(scores, field, false);
    for (let i = 0; i < label.allowed_claims.length; i++) add(scores, "claims.recall", false);
    return 0;
  }

  const category = built.category === label.category;
  add(scores, "category", category);
  if (!category && notes.length < MAX_NOTES) notes.push(`${label.group}: category "${built.category}" ≠ "${label.category}"`);

  for (const [key, value] of Object.entries(label.attributes)) {
    const got = normalizeForMatch(built.attributes[key] ?? "");
    const ok = !!got && (got.includes(normalizeForMatch(value)) || normalizeForMatch(value).includes(got));
    add(scores, `attributes.${key}`, ok);
    if (!ok && notes.length < MAX_NOTES) notes.push(`${label.group}: ${key} "${built.attributes[key] ?? ""}" ≠ "${value}"`);
  }

  const status = built.reviewReasons.length > 0 ? "needs_review" : "ready";
  add(scores, "status", status === label.expected_status);
  if (status !== label.expected_status && notes.length < MAX_NOTES) {
    notes.push(`${label.group}: ${status}${built.reviewReasons[0] ? ` (${built.reviewReasons[0]})` : ""}, expected ${label.expected_status}`);
  }

  for (const claim of label.allowed_claims) {
    const found = built.claims.some((c) => claimMatches(c.text, claim.text));
    add(scores, "claims.recall", found);
    if (!found && notes.length < MAX_NOTES) notes.push(`${label.group}: missed claim "${claim.text}"`);
  }

  const output = normalizeForMatch(
    [built.title, htmlToText(built.descriptionHtml), built.tags.join(" "), Object.values(built.attributes).join(" "), built.claims.map((c) => c.text).join(" ")].join(" "),
  );
  let invented = 0;
  for (const term of label.forbidden_claims) {
    if (mentions(output, term)) {
      invented += 1;
      if (notes.length < MAX_NOTES) notes.push(`${label.group}: invented "${term}"`);
    }
  }
  return invented;
}
