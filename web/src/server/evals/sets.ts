import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.env.EVALS_DIR ?? "../evals");

export interface LabelVariant {
  sku: string;
  options: Record<string, string>;
  price_cents: number | null;
  currency: string;
  weight_grams: number | null;
}

export interface LabelProduct {
  group: string;
  source_rows: number[];
  category: string;
  attributes: Record<string, string>;
  variants: LabelVariant[];
  allowed_claims: { text: string }[];
  forbidden_claims: string[];
  expected_status: "ready" | "needs_review";
  duplicate_rows?: { row: number; duplicate_of: number }[];
}

export interface Labels {
  total_rows: number;
  products: LabelProduct[];
  duplicate_rows?: { row: number; duplicate_of: number }[];
}

export class EvalSetError extends Error {}

export function listEvalSets() {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(DIR, d.name, "labels.json")) && existsSync(path.join(DIR, d.name, "supplier-sheet.csv")))
    .map((d) => {
      const labels = JSON.parse(readFileSync(path.join(DIR, d.name, "labels.json"), "utf8")) as Labels;
      return { name: d.name, products: labels.products.length, rows: labels.total_rows };
    })
    .sort((a, b) => a.products - b.products);
}

export function loadEvalSet(name: string) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new EvalSetError("Unknown eval set");
  const dir = path.join(DIR, name);
  if (!existsSync(path.join(dir, "labels.json"))) throw new EvalSetError(`Eval set "${name}" was not found in ${DIR}`);
  return {
    sheet: readFileSync(path.join(dir, "supplier-sheet.csv")),
    labels: JSON.parse(readFileSync(path.join(dir, "labels.json"), "utf8")) as Labels,
  };
}
