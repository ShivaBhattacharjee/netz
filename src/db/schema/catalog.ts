import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { store } from "./store";

export const uploadKind = pgEnum("upload_kind", ["sheet", "zip", "photo"]);
export const importStatus = pgEnum("import_status", ["queued", "processing", "paused", "completed", "failed", "cancelled"]);
export const rowStatus = pgEnum("row_status", ["pending", "done", "needs_review", "failed"]);
export const groupStatus = pgEnum("group_status", ["pending", "done", "needs_review", "failed", "skipped"]);
export const modelRoute = pgEnum("model_route", ["cheap", "strong"]);
export const photoStatus = pgEnum("photo_status", ["matched", "unmatched", "duplicate", "invalid"]);
export const productStatus = pgEnum("product_status", ["ready", "needs_review", "approved", "failed"]);
export const translationOrigin = pgEnum("translation_origin", ["ai", "manual"]);
export const translationState = pgEnum("translation_state", ["current", "out_of_date"]);

export type RowCounts = { pending: number; done: number; needs_review: number; failed: number };
export type Claim = { text: string; source: string };
export type Seo = { meta_title: string; meta_description: string };

const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const storeRef = () =>
  text("store_id")
    .notNull()
    .references(() => store.id, { onDelete: "cascade" });

export const upload = pgTable(
  "upload",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: uploadKind("kind").notNull(),
    fileName: text("file_name").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("upload_store_idx").on(t.storeId)],
);

export const importJob = pgTable(
  "import",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    status: importStatus("status").notNull().default("queued"),
    sheetUploadId: text("sheet_upload_id")
      .notNull()
      .references(() => upload.id),
    photoUploadIds: text("photo_upload_ids").array().notNull().default(sql`'{}'::text[]`),
    fileName: text("file_name").notNull(),
    fileBytes: bigint("file_bytes", { mode: "number" }).notNull(),
    fileSha256: text("file_sha256").notNull(),
    defaultCurrency: text("default_currency").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    counts: jsonb("counts").$type<RowCounts>().notNull().default({ pending: 0, done: 0, needs_review: 0, failed: 0 }),
    photoCount: integer("photo_count").notNull().default(0),
    unmatchedPhotos: text("unmatched_photos").array().notNull().default(sql`'{}'::text[]`),
    error: text("error"),
    pausedUntil: timestamp("paused_until"),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    estimateMicros: bigint("estimate_micros", { mode: "number" }),
    budgetMicros: bigint("budget_micros", { mode: "number" }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("import_store_created_idx").on(t.storeId, t.createdAt), index("import_status_idx").on(t.status)],
);

export const importGroup = pgTable(
  "import_group",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => importJob.id, { onDelete: "cascade" }),
    storeId: storeRef(),
    groupKey: text("group_key").notNull(),
    input: jsonb("input").notNull(),
    inputHash: text("input_hash").notNull(),
    route: modelRoute("route").notNull(),
    routeReasons: text("route_reasons").array().notNull().default(sql`'{}'::text[]`),
    status: groupStatus("status").notNull().default("pending"),
    reason: text("reason"),
    productId: text("product_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("import_group_key_uq").on(t.importId, t.groupKey),
    index("import_group_status_idx").on(t.importId, t.status),
  ],
);

export const sourceRow = pgTable(
  "source_row",
  {
    importId: text("import_id")
      .notNull()
      .references(() => importJob.id, { onDelete: "cascade" }),
    storeId: storeRef(),
    rowNumber: integer("row_number").notNull(),
    cells: jsonb("cells").$type<Record<string, string>>().notNull(),
    normalized: jsonb("normalized").notNull(),
    rowHash: text("row_hash").notNull(),
    groupKey: text("group_key"),
    status: rowStatus("status").notNull().default("pending"),
    reason: text("reason"),
    productId: text("product_id"),
  },
  (t) => [
    primaryKey({ columns: [t.importId, t.rowNumber] }),
    index("source_row_status_idx").on(t.importId, t.status),
    index("source_row_group_idx").on(t.importId, t.groupKey),
  ],
);

export const photo = pgTable(
  "photo",
  {
    id: text("id").primaryKey(),
    importId: text("import_id").references(() => importJob.id, { onDelete: "set null" }),
    storeId: storeRef(),
    fileName: text("file_name").notNull(),
    sha256: text("sha256"),
    storageKey: text("storage_key"),
    width: integer("width"),
    height: integer("height"),
    status: photoStatus("status").notNull(),
    groupKey: text("group_key"),
    duplicateOf: text("duplicate_of"),
    reason: text("reason"),
  },
  (t) => [uniqueIndex("photo_import_name_uq").on(t.importId, t.fileName), index("photo_group_idx").on(t.importId, t.groupKey)],
);

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    groupKey: text("group_key").notNull(),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    descriptionHtml: text("description_html").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    claims: jsonb("claims").$type<Claim[]>().notNull().default([]),
    confidence: jsonb("confidence").$type<Record<string, number>>().notNull().default({}),
    seo: jsonb("seo").$type<Seo>(),
    status: productStatus("status").notNull(),
    reviewReason: text("review_reason"),
    sourceRows: integer("source_rows").array().notNull().default(sql`'{}'::int[]`),
    lastImportId: text("last_import_id"),
    inputHash: text("input_hash").notNull(),
    manualFields: text("manual_fields").array().notNull().default(sql`'{}'::text[]`),
    deletedAt: timestamp("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("product_store_group_uq").on(t.storeId, t.groupKey),
    uniqueIndex("product_store_handle_uq").on(t.storeId, t.handle),
    index("product_store_status_idx").on(t.storeId, t.status),
  ],
);

export const variant = pgTable(
  "variant",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceCents: integer("price_cents"),
    currency: text("currency").notNull(),
    weightGrams: integer("weight_grams"),
    position: integer("position").notNull().default(0),
    skuDerived: boolean("sku_derived").notNull().default(false),
    missingSince: text("missing_since"),
  },
  (t) => [uniqueIndex("variant_store_sku_uq").on(t.storeId, t.sku), index("variant_product_idx").on(t.productId)],
);

export const productPhoto = pgTable(
  "product_photo",
  {
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    photoId: text("photo_id")
      .notNull()
      .references(() => photo.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productId, t.photoId] })],
);

export const translation = pgTable(
  "translation",
  {
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    storeId: storeRef(),
    locale: text("locale").notNull(),
    field: text("field").notNull(),
    text: text("text").notNull(),
    origin: translationOrigin("origin").notNull().default("ai"),
    sourceHash: text("source_hash").notNull(),
    state: translationState("state").notNull().default("current"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.locale, t.field] }), index("translation_store_locale_idx").on(t.storeId, t.locale)],
);

export const aiResult = pgTable("ai_result", {
  key: text("key").primaryKey(),
  output: jsonb("output").notNull(),
  createdAt: createdAt(),
});

export const aiCall = pgTable(
  "ai_call",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    importId: text("import_id"),
    productId: text("product_id"),
    groupId: text("group_id"),
    task: text("task").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull(),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_call_import_idx").on(t.importId), index("ai_call_store_created_idx").on(t.storeId, t.createdAt)],
);

export const webhook = pgTable(
  "webhook",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    secret: text("secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_store_idx").on(t.storeId)],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhook.id, { onDelete: "cascade" }),
    storeId: storeRef(),
    event: text("event").notNull(),
    status: integer("status"),
    ok: boolean("ok").notNull(),
    attempt: integer("attempt").notNull(),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_delivery_store_created_idx").on(t.storeId, t.createdAt)],
);

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_key_hash_uq").on(t.hash), index("api_key_store_idx").on(t.storeId)],
);

export const evalStatus = pgEnum("eval_status", ["queued", "running", "completed", "failed"]);

export type FieldScores = Record<string, { correct: number; total: number }>;

export const experiment = pgTable(
  "experiment",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    name: text("name").notNull(),
    set: text("set").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("experiment_store_idx").on(t.storeId)],
);

export const evalRun = pgTable(
  "eval_run",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    experimentId: text("experiment_id").references(() => experiment.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    set: text("set").notNull(),
    model: text("model").notNull(),
    prompt: text("prompt").notNull(),
    promptVersion: text("prompt_version").notNull(),
    sampleLimit: integer("sample_limit").notNull(),
    status: evalStatus("status").notNull().default("queued"),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    scores: jsonb("scores").$type<FieldScores>().notNull().default({}),
    inventedClaims: integer("invented_claims").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    p50Ms: integer("p50_ms").notNull().default(0),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    error: text("error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [index("eval_run_store_created_idx").on(t.storeId, t.createdAt), index("eval_run_experiment_idx").on(t.experimentId)],
);

export const customPrompt = pgTable(
  "custom_prompt",
  {
    id: text("id").primaryKey(),
    storeId: storeRef(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    system: text("system").notNull(),
    user: text("user").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("custom_prompt_store_idx").on(t.storeId)],
);
