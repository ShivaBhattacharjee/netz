import { readFileSync } from "node:fs";
import path from "node:path";
import { buildGroups, cleanRows, sheetDecimalHint } from "@/server/pipeline/group";
import { detectHeader } from "@/server/pipeline/headers";
import { parseSheet } from "@/server/pipeline/sheet";
import type { Product } from "@/lib/types";

export const evalPath = (...parts: string[]) => path.join(process.cwd(), "evals", ...parts);

export function loadRows(rows: string[][], currency = "EUR") {
  const header = detectHeader(rows);
  if (!header) throw new Error("No header row found");
  const dataRows = rows
    .slice(header.index + 1)
    .map((raw, i) => ({ row: header.index + 2 + i, raw }))
    .filter((r) => r.raw.some((c) => c.trim() !== ""));
  const cleaned = cleanRows(dataRows, header, currency, sheetDecimalHint(dataRows.map((r) => r.raw), header));
  return { header, dataRows, cleaned, ...buildGroups(cleaned, currency) };
}

export function loadSheet(file: string, kind: "csv" | "xlsx" = "csv") {
  const sheet = parseSheet(readFileSync(file), kind);
  return { sheet, ...loadRows(sheet.rows) };
}

export function loadCsv(text: string) {
  return loadRows(parseSheet(Buffer.from(text), "csv").rows);
}

export function reviewReasons(groups: { review_reasons: string[] }[]) {
  return groups.flatMap((g) => g.review_reasons);
}

export function product(overrides: Partial<Product> = {}): Product {
  const missing = { text: "", origin: "ai", state: "missing" } as const;
  return {
    id: "prod_test",
    handle: "test-product",
    title: "Test product",
    description_html: "<p>Test</p>",
    category: "Home & Garden > Planters",
    tags: [],
    attributes: {},
    attribute_translations: { de: {}, fr: {} },
    variants: [{ sku: "TEST-1", options: {}, price_cents: 1299, currency: "EUR", weight_grams: 320 }],
    claims: [],
    confidence: {},
    status: "ready",
    review_reason: null,
    source_rows: [2],
    sources: [],
    photos: [],
    translations: { de: { title: missing, description_html: missing }, fr: { title: missing, description_html: missing } },
    seo: { en: { meta_title: "", meta_description: "" }, de: { meta_title: "", meta_description: "" }, fr: { meta_title: "", meta_description: "" } },
    manual_fields: [],
    usage: { model: "", input_tokens: 0, output_tokens: 0, cost_micros: 0, latency_ms: 0 },
    updated_at: "2026-10-21T00:00:00.000Z",
    ...overrides,
  } as unknown as Product;
}
