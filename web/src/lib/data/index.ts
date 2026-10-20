import type { ImportJob, ImportRow, Locale, Product, RowStatus, TranslatableField } from "../types";
import { costHistory, modelPricing, seedImportRows, seedImports, seedProducts } from "./seed";

export { costHistory, modelPricing };

export function listImports(): ImportJob[] {
  return seedImports;
}

export function listProducts(): Product[] {
  return seedProducts;
}

export function getProduct(id: string): Product | undefined {
  return seedProducts.find((p) => p.id === id);
}

export function syntheticRows(job: ImportJob): ImportRow[] {
  const { done, needs_review, failed } = job.counts;
  const finished = done + needs_review + failed;
  const rows: ImportRow[] = [];
  let reviewLeft = needs_review;
  let failedLeft = failed;
  for (let i = 0; i < job.total_rows; i++) {
    let status: RowStatus = "pending";
    let reason: string | null = null;
    if (i < finished) {
      const remaining = finished - i;
      if (failedLeft > 0 && (i * 7919) % remaining < failedLeft) {
        status = "failed";
        reason = "Request timed out 5 times";
        failedLeft -= 1;
      } else if (reviewLeft > 0 && (i * 104729) % remaining < reviewLeft) {
        status = "needs_review";
        reason = "Low confidence on category";
        reviewLeft -= 1;
      } else {
        status = "done";
      }
    }
    const n = i + 2;
    rows.push({
      row: n,
      sku: `LG-${String(n).padStart(5, "0")}`,
      title: `Artikel ${n}`,
      status,
      product_id: null,
      reason,
    });
  }
  return rows;
}

export function getImportRows(job: ImportJob): ImportRow[] {
  return seedImportRows[job.id] ?? syntheticRows(job);
}

export function publishedProducts(): Product[] {
  return seedProducts.filter((p) => p.status === "approved");
}

export function localized(product: Product, locale: Locale, field: TranslatableField): string {
  if (locale === "en") return product[field];
  const t = product.translations[locale][field];
  return t.state === "missing" ? product[field] : t.text;
}
