import { type Job, Worker } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { product, store, translation } from "@/db/schema";
import { type Usage, classify } from "../ai/anthropic";
import { type LocaleResult, type TranslateLocale, translateFields } from "../ai/translate";
import { env } from "../env";
import { sha256, stableJson } from "../ids";
import { log } from "../log";
import type { TranslateJob } from "../queues";
import { recordCalls } from "./calls";
import { pauseOnAiError, recordProviderSuccess, waitIfPaused } from "./gate";
import { publish } from "./progress";

type ProductRow = typeof product.$inferSelect;

export const ATTRIBUTE_FIELD_PREFIX = "attributes.";
const UNTRANSLATED_ATTRIBUTES = new Set(["brand"]);

type EnglishSource = Pick<ProductRow, "title" | "descriptionHtml" | "seo" | "attributes">;

export function englishFields(p: EnglishSource): Record<string, string> {
  const fields: Record<string, string> = { title: p.title, description_html: p.descriptionHtml };
  if (p.seo?.meta_title) fields.meta_title = p.seo.meta_title;
  if (p.seo?.meta_description) fields.meta_description = p.seo.meta_description;
  for (const [key, value] of Object.entries(p.attributes ?? {})) {
    if (!UNTRANSLATED_ATTRIBUTES.has(key) && value.trim()) fields[`${ATTRIBUTE_FIELD_PREFIX}${key}`] = value;
  }
  return fields;
}

export function englishSourceHash(p: EnglishSource) {
  return sha256(stableJson(englishFields(p)));
}

export async function runTranslate(job: Job<TranslateJob>, worker: Worker) {
  const { productId } = job.data;
  const locales: TranslateLocale[] = job.data.locale ? [job.data.locale] : ["de", "fr"];
  const [p] = await db.select().from(product).where(eq(product.id, productId));
  if (!p || p.deletedAt || p.status === "failed") return { skipped: true };

  const source = englishFields(p);
  const existing = await db.select().from(translation).where(and(eq(translation.productId, productId), inArray(translation.locale, locales)));
  const stored = new Map(existing.map((t) => [`${t.locale}|${t.field}`, t]));

  const todo: Record<string, string> = {};
  const keys: Partial<Record<TranslateLocale, string[]>> = {};
  const outOfDate: { locale: TranslateLocale; field: string }[] = [];
  for (const locale of locales) {
    for (const [field, text] of Object.entries(source)) {
      if (!text.trim()) continue;
      const current = stored.get(`${locale}|${field}`);
      if (current?.sourceHash === sha256(text)) continue;
      if (current?.origin === "manual") {
        outOfDate.push({ locale, field });
      } else {
        todo[field] = text;
        (keys[locale] ??= []).push(field);
      }
    }
  }

  for (const { locale, field } of outOfDate) {
    await db
      .update(translation)
      .set({ state: "out_of_date" })
      .where(and(eq(translation.productId, productId), eq(translation.locale, locale), eq(translation.field, field)));
  }

  const config = env();
  if (Object.keys(todo).length === 0 || config.AI_MODE === "mock") return { translated: 0, outOfDate: outOfDate.length };

  await waitIfPaused(worker);

  const [owner] = await db.select({ name: store.name }).from(store).where(eq(store.id, p.storeId));
  const protectedNames = [p.attributes.brand, owner?.name].filter((n): n is string => !!n);
  const model = config.AI_MODEL_TRANSLATE;
  const ctx = { storeId: p.storeId, importId: p.lastImportId, productId };

  let result;
  try {
    result = await translateFields(model, todo, keys, protectedNames);
  } catch (raw) {
    const error = classify(raw);
    const meta = raw as { usage?: Usage; latencyMs?: number; promptVersion?: string };
    const call = { model, promptVersion: meta.promptVersion ?? "translate", task: "translate" as const, latencyMs: meta.latencyMs ?? 0, ok: false, errorCode: error.kind };
    await recordCalls(db, [{ ...call, usage: meta.usage ?? { inputTokens: 0, outputTokens: 0 } }], ctx);
    await pauseOnAiError(worker, error);
    throw error;
  }

  await db.transaction(async (tx) => {
    for (const [locale, out] of Object.entries(result.byLocale) as [TranslateLocale, LocaleResult][]) {
      for (const [field, text] of Object.entries(out.fields)) {
        const sourceHash = sha256(todo[field]);
        await tx
          .insert(translation)
          .values({ productId, storeId: p.storeId, locale, field, text, origin: "ai", sourceHash, state: "current" })
          .onConflictDoUpdate({
            target: [translation.productId, translation.locale, translation.field],
            set: { text, sourceHash, state: "current" },
            setWhere: sql`${translation.origin} = 'ai'`,
          });
      }
    }
    await recordCalls(tx, [{ model, promptVersion: result.promptVersion, task: "translate", usage: result.usage, latencyMs: result.latencyMs, ok: true, errorCode: null }], ctx);
  });
  await recordProviderSuccess(null);

  await publish({ type: "product.updated", storeId: p.storeId, productId });
  const failed = Object.fromEntries(Object.entries(result.byLocale).flatMap(([locale, out]) => Object.entries(out.failed).map(([field, why]) => [`${locale}.${field}`, why])));
  if (Object.keys(failed).length > 0) {
    log.warn("translation rejected by validator", { productId, failed });
    if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw new Error(`Translation failed checks for ${Object.keys(failed).join(", ")}`);
  }
  const translated = Object.values(result.byLocale).reduce((n, out) => n + Object.keys(out.fields).length, 0);
  return { translated, failed: Object.keys(failed), outOfDate: outOfDate.length };
}
