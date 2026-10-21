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
  missing_from_import: boolean;
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
  /** Current translations of attribute values; a key that is missing falls back to English. */
  attribute_translations: Record<TranslatedLocale, Record<string, string>>;
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
  unmatched_photos: { name: string; url: string | null }[];
  cost_micros: number;
  estimate_micros: number | null;
  budget_micros: number | null;
  budget_paused: boolean;
}

export interface ImportRow {
  row: number;
  sku: string;
  title: string;
  status: RowStatus;
  product_id: string | null;
  reason: string | null;
}

export interface ImportRowDetail extends ImportRow {
  cells: Record<string, string>;
  repairs: string[];
  group_key: string | null;
  duplicate_of: number | null;
  retryable: boolean;
  product: { id: string; title: string; status: ProductStatus; review_reason: string | null } | null;
}

export interface QueueStats {
  queues: { name: string; waiting: number; active: number; delayed: number; completed: number; failed: number; workers: number }[];
  pause: { until: string; reason: string } | null;
}

export interface Metrics {
  by: Record<ProductStatus, number>;
  total: number;
  cost_micros: number;
  baseline_micros: number;
  strong_model: string;
  avg_ms: number;
  p95_ms: number;
  latency: { bucket: string; count: number }[];
  models: { model: string; calls: number; products: number; cost_micros: number }[];
  coverage: { language: string; current: number; outOfDate: number; missing: number; total: number }[];
  funnel: { label: string; value: number }[];
  daily: { day: string; done: number; review: number; failed: number; cost_micros: number; saved_micros: number }[];
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret_hint: string;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  status: number | null;
  ok: boolean;
  attempt: number;
  duration_ms: number;
  error: string | null;
  at: string;
}

export interface EvalRun {
  id: string;
  experiment_id: string | null;
  label: string;
  set: string;
  model: string;
  prompt: string;
  prompt_version: string;
  sample_limit: number;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  done: number;
  scores: Record<string, { correct: number; total: number }>;
  invented_claims: number;
  failures: number;
  cost_micros: number;
  input_tokens: number;
  output_tokens: number;
  p50_ms: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  notes?: string[];
}

export interface EvalOptions {
  sets: { name: string; products: number; rows: number }[];
  prompts: { name: string; label: string; version: string; custom: boolean }[];
  models: { id: string; label: string; hint: string }[];
}

export interface Experiment {
  id: string;
  name: string;
  set: string;
  created_at: string;
  variants: EvalRun[];
}
