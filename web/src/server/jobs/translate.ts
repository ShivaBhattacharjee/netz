import { type Job, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { product, store, translation } from "@/db/schema";
import { classify } from "../ai/gemini";
import { translateFields } from "../ai/translate";
import { env } from "../env";
import { sha256, stableJson } from "../ids";
import { log } from "../log";
import type { TranslateJob } from "../queues";
import { recordCalls } from "./calls";
import { currentPause, pauseAi, pauseFor } from "./gate";
import { publish } from "./progress";

type ProductRow = typeof product.$inferSelect;

export function englishFields(p: Pick<ProductRow, "title" | "descriptionHtml" | "seo">): Record<string, string> {
  const fields: Record<string, string> = { title: p.title, description_html: p.descriptionHtml };
  if (p.seo?.meta_title) fields.meta_title = p.seo.meta_title;
  if (p.seo?.meta_description) fields.meta_description = p.seo.meta_description;
  return fields;
}

export function englishSourceHash(p: Pick<ProductRow, "title" | "descriptionHtml" | "seo">) {
  return sha256(stableJson(englishFields(p)));
}

export async function runTranslate(job: Job<TranslateJob>, worker: Worker) {
  const { productId, locale } = job.data;
  const [p] = await db.select().from(product).where(eq(product.id, productId));
  if (!p || p.deletedAt || p.status === "failed") return { skipped: true };

  const source = englishFields(p);
  const existing = await db.select().from(translation).where(and(eq(translation.productId, productId), eq(translation.locale, locale)));
  const byField = new Map(existing.map((t) => [t.field, t]));

  const todo: Record<string, string> = {};
  const outOfDate: string[] = [];
  for (const [field, text] of Object.entries(source)) {
    if (!text.trim()) continue;
    const hash = sha256(text);
    const current = byField.get(field);
    if (current?.sourceHash === hash) continue;
    if (current?.origin === "manual") outOfDate.push(field);
    else todo[field] = text;
  }

  for (const field of outOfDate) {
    await db
      .update(translation)
      .set({ state: "out_of_date" })
      .where(and(eq(translation.productId, productId), eq(translation.locale, locale), eq(translation.field, field)));
  }

  const config = env();
  if (Object.keys(todo).length === 0 || config.AI_MODE === "mock") return { translated: 0, outOfDate: outOfDate.length };

  const pause = await currentPause();
  if (pause) {
    await worker.rateLimit(pause.until - Date.now());
    throw Worker.RateLimitError();
  }

  const [owner] = await db.select({ name: store.name }).from(store).where(eq(store.id, p.storeId));
  const protectedNames = [p.attributes.brand, owner?.name].filter((n): n is string => !!n);
  const model = config.GEMINI_MODEL_TRANSLATE;

  let result;
  try {
    result = await translateFields(model, locale, todo, protectedNames);
  } catch (raw) {
    const error = classify(raw);
    const meta = raw as { usage?: { inputTokens: number; outputTokens: number }; latencyMs?: number; promptVersion?: string };
    await recordCalls(db, [{ model, promptVersion: meta.promptVersion ?? "translate", task: "translate", usage: meta.usage ?? { inputTokens: 0, outputTokens: 0 }, latencyMs: meta.latencyMs ?? 0, ok: false, errorCode: error.kind }], {
      storeId: p.storeId,
      importId: p.lastImportId,
      productId,
    });
    const pauseInfo = pauseFor(error);
    if (pauseInfo) {
      await pauseAi(pauseInfo.ms, pauseInfo.reason);
      await worker.rateLimit(pauseInfo.ms);
      throw Worker.RateLimitError();
    }
    throw error;
  }

  await db.transaction(async (tx) => {
    for (const [field, text] of Object.entries(result.fields)) {
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
    await recordCalls(tx, [{ model, promptVersion: result.promptVersion, task: "translate", usage: result.usage, latencyMs: result.latencyMs, ok: true, errorCode: null }], {
      storeId: p.storeId,
      importId: p.lastImportId,
      productId,
    });
  });

  await publish({ type: "product.updated", storeId: p.storeId, productId });
  const failed = Object.keys(result.failed);
  if (failed.length > 0) {
    log.warn("translation rejected by validator", { productId, locale, failed: result.failed });
    if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw new Error(`Translation failed checks for ${failed.join(", ")}`);
  }
  return { translated: Object.keys(result.fields).length, failed, outOfDate: outOfDate.length };
}
