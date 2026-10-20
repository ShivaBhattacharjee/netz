export type Locale = "en" | "de" | "fr";
export type TranslatedLocale = Exclude<Locale, "en">;

export type ProductStatus = "ready" | "needs_review" | "approved" | "failed";
export type RowStatus = "pending" | "done" | "needs_review" | "failed";
export type ImportStatus = "queued" | "processing" | "paused" | "completed" | "failed" | "cancelled";

export interface Variant {
  sku: string;
  options: Record<string, string>;
  price_cents: number | null;
  currency: string;
  weight_grams: number | null;
}

export interface Claim {
  text: string;
  source: string;
}

export interface SourceRow {
  row: number;
  cells: Record<string, string>;
}

export type TranslatableField = "title" | "description_html";
export type TranslationState = "current" | "out_of_date" | "missing";

export interface FieldTranslation {
  text: string;
  origin: "ai" | "manual";
  state: TranslationState;
}

export type ProductTranslations = Record<TranslatedLocale, Record<TranslatableField, FieldTranslation>>;

export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  latency_ms: number;
}

export interface SeoFields {
  meta_title: string;
  meta_description: string;
}

export interface Product {
  id: string;
  store_id: string;
  import_id: string;
  title: string;
  handle: string;
  description_html: string;
  category: string;
  tags: string[];
  attributes: Record<string, string>;
  variants: Variant[];
  claims: Claim[];
  confidence: Record<string, number>;
  status: ProductStatus;
  review_reason: string | null;
  source_rows: number[];
  sources: SourceRow[];
  photos: string[];
  translations: ProductTranslations;
  seo: Record<Locale, SeoFields>;
  manual_fields: string[];
  usage: ModelUsage;
  updated_at: string;
}

export interface RowCounts {
  pending: number;
  done: number;
  needs_review: number;
  failed: number;
}

export interface ImportJob {
  id: string;
  store_id: string;
  file_name: string;
  file_bytes: number;
  photo_count: number;
  total_rows: number;
  counts: RowCounts;
  status: ImportStatus;
  resume_in_seconds: number | null;
  error: string | null;
  created_at: string;
  unmatched_photos: string[];
  cost_micros: number;
}

export interface ImportRow {
  row: number;
  sku: string;
  title: string;
  status: RowStatus;
  product_id: string | null;
  reason: string | null;
}
