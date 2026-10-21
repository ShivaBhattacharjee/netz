import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiCall, importGroup, photo, product, productPhoto, sourceRow, translation, variant } from "@/db/schema";
import type {
  FieldTranslation,
  Locale,
  ModelUsage,
  Product,
  ProductTranslations,
  SeoFields,
  TranslatableField,
  TranslatedLocale,
} from "@/lib/types";
import { sha256 } from "./ids";
import { enqueueTranslate } from "./queues";
import { englishSourceHash } from "./jobs/translate";
import { emitWebhook } from "./webhooks";

type ProductRow = typeof product.$inferSelect;

const LOCALES: TranslatedLocale[] = ["de", "fr"];
const TRANSLATABLE: TranslatableField[] = ["title", "description_html"];

export class ProductInputError extends Error {}

function emptyUsage(): ModelUsage {
  return { model: "", input_tokens: 0, output_tokens: 0, cost_micros: 0, latency_ms: 0 };
}

async function loadRelations(rows: ProductRow[]) {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { variants: [], photos: [], translations: [], usage: [] };
  const [variants, photos, translations, usage] = await Promise.all([
    db.select().from(variant).where(inArray(variant.productId, ids)).orderBy(asc(variant.position)),
    db
      .select({ productId: productPhoto.productId, photoId: productPhoto.photoId, position: productPhoto.position })
      .from(productPhoto)
      .where(inArray(productPhoto.productId, ids))
      .orderBy(asc(productPhoto.position)),
    db.select().from(translation).where(inArray(translation.productId, ids)),
    db
      .select({
        productId: aiCall.productId,
        model: sql<string>`(array_agg(${aiCall.model} order by ${aiCall.createdAt} desc))[1]`,
        inputTokens: sql<number>`coalesce(sum(${aiCall.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiCall.outputTokens}), 0)::int`,
        costMicros: sql<number>`coalesce(sum(${aiCall.costMicros}), 0)::bigint`,
        latencyMs: sql<number>`coalesce(sum(${aiCall.latencyMs}) filter (where ${aiCall.task} <> 'translate'), 0)::int`,
      })
      .from(aiCall)
      .where(inArray(aiCall.productId, ids))
      .groupBy(aiCall.productId),
  ]);
  return { variants, photos, translations, usage };
}

function toProduct(row: ProductRow, rel: Awaited<ReturnType<typeof loadRelations>>, sources: Product["sources"] = []): Product {
  const english = { title: row.title, description_html: row.descriptionHtml };
  const englishSeo: SeoFields = row.seo ?? { meta_title: "", meta_description: "" };
  const own = rel.translations.filter((t) => t.productId === row.id);

  const translations = {} as ProductTranslations;
  const seo = { en: englishSeo } as Record<Locale, SeoFields>;
  for (const locale of LOCALES) {
    const byField = new Map(own.filter((t) => t.locale === locale).map((t) => [t.field, t]));
    translations[locale] = {} as Record<TranslatableField, FieldTranslation>;
    for (const field of TRANSLATABLE) {
      const t = byField.get(field);
      const current = t && t.sourceHash === sha256(english[field]);
      translations[locale][field] = t
        ? { text: t.text, origin: t.origin, state: t.state === "out_of_date" || !current ? (t.origin === "manual" ? "out_of_date" : "missing") : "current" }
        : { text: "", origin: "ai", state: "missing" };
    }
    seo[locale] = {
      meta_title: byField.get("meta_title")?.text ?? "",
      meta_description: byField.get("meta_description")?.text ?? "",
    };
  }

  const usage = rel.usage.find((u) => u.productId === row.id);
  return {
    id: row.id,
    store_id: row.storeId,
    import_id: row.lastImportId ?? "",
    title: row.title,
    handle: row.handle,
    description_html: row.descriptionHtml,
    category: row.category,
    tags: row.tags,
    attributes: row.attributes,
    variants: rel.variants
      .filter((v) => v.productId === row.id)
      .map((v) => ({ sku: v.sku, options: v.options, price_cents: v.priceCents, currency: v.currency, weight_grams: v.weightGrams })),
    claims: row.claims,
    confidence: row.confidence,
    status: row.status,
    review_reason: row.reviewReason,
    source_rows: row.sourceRows,
    sources,
    photos: rel.photos.filter((p) => p.productId === row.id).map((p) => `/api/photos/${p.photoId}`),
    translations,
    seo,
    manual_fields: row.manualFields,
    usage: usage
      ? { model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cost_micros: Number(usage.costMicros), latency_ms: usage.latencyMs }
      : emptyUsage(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const live = (storeId: string) => and(eq(product.storeId, storeId), isNull(product.deletedAt));

export async function listProducts(storeId: string): Promise<Product[]> {
  const rows = await db.select().from(product).where(live(storeId)).orderBy(desc(product.updatedAt));
  const rel = await loadRelations(rows);
  return rows.map((r) => toProduct(r, rel));
}

export async function getProduct(storeId: string, id: string): Promise<Product | null> {
  const [row] = await db.select().from(product).where(and(live(storeId), eq(product.id, id)));
  if (!row) return null;
  const rel = await loadRelations([row]);
  const sources = row.lastImportId
    ? await db
        .select({ row: sourceRow.rowNumber, cells: sourceRow.cells })
        .from(sourceRow)
        .where(and(eq(sourceRow.importId, row.lastImportId), eq(sourceRow.productId, row.id)))
        .orderBy(asc(sourceRow.rowNumber))
    : [];
  return toProduct(row, rel, sources);
}

export async function listPublished(storeId: string): Promise<Product[]> {
  const rows = await db
    .select()
    .from(product)
    .where(and(live(storeId), eq(product.status, "approved")))
    .orderBy(asc(product.title));
  const rel = await loadRelations(rows);
  return rows.map((r) => toProduct(r, rel));
}

export async function getPublishedByHandle(storeId: string, handle: string): Promise<Product | null> {
  const [row] = await db
    .select()
    .from(product)
    .where(and(live(storeId), eq(product.status, "approved"), eq(product.handle, handle)));
  if (!row) return null;
  return toProduct(row, await loadRelations([row]));
}

async function owned(storeId: string, id: string) {
  const [row] = await db.select().from(product).where(and(live(storeId), eq(product.id, id)));
  if (!row) throw new ProductInputError("Product not found");
  return row;
}

function withManual(row: ProductRow, field: string) {
  return row.manualFields.includes(field) ? row.manualFields : [...row.manualFields, field];
}

async function retranslate(row: ProductRow) {
  const hash = englishSourceHash(row);
  for (const locale of LOCALES) await enqueueTranslate(row.id, locale, hash);
}

export async function approveProducts(storeId: string, ids: string[]) {
  const updated = await db
    .update(product)
    .set({ status: "approved", reviewReason: null })
    .where(and(live(storeId), inArray(product.id, ids), ne(product.status, "failed")))
    .returning({ id: product.id, handle: product.handle, title: product.title });
  if (updated.length) await emitWebhook(storeId, "product.approved", { products: updated.map((p) => ({ id: p.id, handle: p.handle, title: p.title })) });
  return updated.length;
}

export async function unpublishProducts(storeId: string, ids: string[]) {
  const updated = await db
    .update(product)
    .set({ status: "ready" })
    .where(and(live(storeId), inArray(product.id, ids), eq(product.status, "approved")))
    .returning({ id: product.id });
  return updated.length;
}

export async function deleteProducts(storeId: string, ids: string[]) {
  const deleted = await db
    .update(product)
    .set({ deletedAt: new Date() })
    .where(and(live(storeId), inArray(product.id, ids)))
    .returning({ id: product.id });
  return deleted.length;
}

export async function sendBack(storeId: string, id: string, note: string) {
  await owned(storeId, id);
  await db
    .update(product)
    .set({ status: "needs_review", reviewReason: note ? `Sent back: ${note}` : "Sent back for regeneration" })
    .where(eq(product.id, id));
}

export type ProductEdit =
  | { kind: "field"; field: "title" | "description_html" | "category"; value: string }
  | { kind: "variant"; sku: string; price_cents: number | null; currency: string; weight_grams: number | null }
  | { kind: "tags"; tags: string[] }
  | { kind: "attribute"; key: string; value: string }
  | { kind: "translation"; locale: TranslatedLocale; field: TranslatableField; text: string }
  | { kind: "seo"; locale: Locale; field: keyof SeoFields; value: string };

export async function editProduct(storeId: string, id: string, edit: ProductEdit) {
  const row = await owned(storeId, id);

  if (edit.kind === "field") {
    const column = { title: "title", description_html: "descriptionHtml", category: "category" } as const;
    if (row[column[edit.field]] === edit.value) return;
    const [saved] = await db
      .update(product)
      .set({ [column[edit.field]]: edit.value, manualFields: withManual(row, edit.field) })
      .where(eq(product.id, id))
      .returning();
    if (edit.field !== "category") await retranslate(saved);
    return;
  }

  if (edit.kind === "variant") {
    const updated = await db
      .update(variant)
      .set({ priceCents: edit.price_cents, currency: edit.currency, weightGrams: edit.weight_grams })
      .where(and(eq(variant.productId, id), eq(variant.sku, edit.sku)))
      .returning({ id: variant.id });
    if (updated.length === 0) throw new ProductInputError(`Variant ${edit.sku} not found`);
    await db.update(product).set({ manualFields: withManual(row, `variants.${edit.sku}`) }).where(eq(product.id, id));
    return;
  }

  if (edit.kind === "tags") {
    const tags = [...new Set(edit.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    await db.update(product).set({ tags, manualFields: withManual(row, "tags") }).where(eq(product.id, id));
    return;
  }

  if (edit.kind === "attribute") {
    const attributes = { ...row.attributes };
    if (edit.value.trim()) attributes[edit.key] = edit.value.trim();
    else delete attributes[edit.key];
    await db.update(product).set({ attributes, manualFields: withManual(row, "attributes") }).where(eq(product.id, id));
    return;
  }

  if (edit.kind === "seo" && edit.locale === "en") {
    const seo = { ...(row.seo ?? { meta_title: "", meta_description: "" }), [edit.field]: edit.value };
    const [saved] = await db.update(product).set({ seo, manualFields: withManual(row, "seo") }).where(eq(product.id, id)).returning();
    await retranslate(saved);
    return;
  }

  const locale = edit.locale as TranslatedLocale;
  const field = edit.field;
  const text = edit.kind === "translation" ? edit.text : edit.value;
  const english: Record<string, string> = {
    title: row.title,
    description_html: row.descriptionHtml,
    meta_title: row.seo?.meta_title ?? "",
    meta_description: row.seo?.meta_description ?? "",
  };
  const values = { text, origin: "manual" as const, sourceHash: sha256(english[field] ?? ""), state: "current" as const };
  await db
    .insert(translation)
    .values({ productId: id, storeId, locale, field, ...values })
    .onConflictDoUpdate({ target: [translation.productId, translation.locale, translation.field], set: values });
  await db.update(product).set({ manualFields: withManual(row, `translations.${locale}.${field}`) }).where(eq(product.id, id));
}

export async function latestGroupFor(productId: string) {
  const [group] = await db.select().from(importGroup).where(eq(importGroup.productId, productId)).orderBy(desc(importGroup.createdAt)).limit(1);
  return group ?? null;
}

export async function photoFile(storeId: string, id: string) {
  const [row] = await db
    .select({ storageKey: photo.storageKey, fileName: photo.fileName })
    .from(photo)
    .where(and(eq(photo.id, id), eq(photo.storeId, storeId)));
  return row?.storageKey ? { storageKey: row.storageKey, fileName: row.fileName } : null;
}
