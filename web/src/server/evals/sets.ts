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

const isSet = (dir: string) => existsSync(path.join(dir, "labels.json")) && existsSync(path.join(dir, "supplier-sheet.csv"));

function setNames(): string[] {
  const subdirs = (rel: string) =>
    readdirSync(path.join(DIR, rel), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => (rel ? `${rel}/${d.name}` : d.name));
  return subdirs("").flatMap((name) => (isSet(path.join(DIR, name)) ? [name] : subdirs(name).filter((n) => isSet(path.join(DIR, n)))));
}

export function listEvalSets() {
  if (!existsSync(DIR)) return [];
  return setNames()
    .map((name) => {
      const labels = JSON.parse(readFileSync(path.join(DIR, name, "labels.json"), "utf8")) as Labels;
      return { name, products: labels.products.length, rows: labels.total_rows };
    })
    .sort((a, b) => a.products - b.products);
}

export function loadEvalSet(name: string) {
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(name)) throw new EvalSetError("Unknown eval set");
  const dir = path.join(DIR, name);
  if (!existsSync(path.join(dir, "labels.json"))) throw new EvalSetError(`Eval set "${name}" was not found in ${DIR}`);
  return {
    sheet: readFileSync(path.join(dir, "supplier-sheet.csv")),
    labels: JSON.parse(readFileSync(path.join(dir, "labels.json"), "utf8")) as Labels,
  };
}
