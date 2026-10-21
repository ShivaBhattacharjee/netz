import { type Job, Worker } from "bullmq";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiResult, importGroup, importJob, photo, product, productPhoto, sourceRow, variant } from "@/db/schema";
import { type AiCallRecord, type BuildOutput, type BuiltProduct, finalizeBuild, generateBuild } from "../ai/build";
import { classify } from "../ai/anthropic";
import { mockBuild } from "../ai/mock";
import { loadPrompt } from "../ai/prompts";
import { env } from "../env";
import { newId, sha256 } from "../ids";
import { log } from "../log";
import type { GroupInput } from "../pipeline/group";
import { comparePhotoNames } from "../pipeline/photos";
import { slugify } from "../pipeline/text";
import { type BuildJob, type RerunJob, enqueueTranslate } from "../queues";
import { overBudget } from "./budget";
import { pauseOnAiError, recordProviderSuccess, waitIfPaused } from "./gate";
import { recordCalls } from "./calls";
import { publish, refreshCounts } from "./progress";
import { englishSourceHash } from "./translate";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isFinalAttempt(job: Job) {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

async function uniqueHandle(tx: Tx, storeId: string, title: string, productId: string | null) {
  const base = slugify(title);
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.storeId, storeId), eq(product.handle, candidate), productId ? ne(product.id, productId) : sql`true`))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${sha256(`${storeId}:${title}:${Date.now()}`).slice(0, 6)}`;
}

async function persist(group: typeof importGroup.$inferSelect, input: GroupInput, built: BuiltProduct, calls: AiCallRecord[]) {
  return db.transaction(async (tx) => {
    const [prior] = await tx.select().from(product).where(and(eq(product.storeId, group.storeId), eq(product.groupKey, group.groupKey))).for("update");
    const productId = prior?.id ?? newId("prod");

    const incoming = new Set(input.variants.map((v) => v.sku));
    const missing = prior
      ? (await tx.select({ id: variant.id, sku: variant.sku }).from(variant).where(eq(variant.productId, productId))).filter((v) => !incoming.has(v.sku))
      : [];
    const reasons = [...built.reviewReasons];
    if (missing.length) {
      reasons.push(`Missing from latest import: ${missing.slice(0, 5).map((v) => v.sku).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}`);
      await tx
        .update(variant)
        .set({ missingSince: group.importId })
        .where(and(inArray(variant.id, missing.map((v) => v.id)), isNull(variant.missingSince)));
    }
    const status = reasons.length > 0 ? ("needs_review" as const) : prior?.status === "approved" ? ("approved" as const) : ("ready" as const);
    const rowStatus = status === "needs_review" ? ("needs_review" as const) : ("done" as const);
    const reviewReason = reasons.join("; ") || null;
    const manual = new Set(prior?.manualFields ?? []);
    const keep = <T>(field: string, next: T, current: T | undefined) => (manual.has(field) && current !== undefined ? current : next);

    const values = {
      title: keep("title", built.title, prior?.title),
      descriptionHtml: keep("description_html", built.descriptionHtml, prior?.descriptionHtml),
      category: keep("category", built.category, prior?.category),
      tags: keep("tags", built.tags, prior?.tags),
      attributes: keep("attributes", built.attributes, prior?.attributes),
      seo: keep("seo", built.seo, prior?.seo ?? undefined),
      claims: built.claims,
      confidence: built.confidence,
      status,
      reviewReason,
      sourceRows: input.source_rows,
      lastImportId: group.importId,
      inputHash: group.inputHash,
    };

    if (prior) {
      await tx.update(product).set(values).where(eq(product.id, productId));
    } else {
      const handle = await uniqueHandle(tx, group.storeId, built.title, null);
      await tx.insert(product).values({ id: productId, storeId: group.storeId, groupKey: group.groupKey, handle, ...values });
    }

    for (const [position, v] of input.variants.entries()) {
      if (manual.has(`variants.${v.sku}`)) continue;
      const set = { productId, options: v.options, priceCents: v.price_cents, currency: v.currency, weightGrams: v.weight_grams, position, skuDerived: v.sku_derived, missingSince: null };
      await tx
        .insert(variant)
        .values({ id: newId("var"), storeId: group.storeId, sku: v.sku, ...set })
        .onConflictDoUpdate({ target: [variant.storeId, variant.sku], set });
    }

    const photos = await tx
      .select({ id: photo.id, fileName: photo.fileName })
      .from(photo)
      .where(and(eq(photo.importId, group.importId), eq(photo.groupKey, group.groupKey), eq(photo.status, "matched")));
    photos.sort((a, b) => comparePhotoNames(a.fileName, b.fileName));
    if (photos.length) {
      await tx.insert(productPhoto).values(photos.map((p, position) => ({ productId, photoId: p.id, position }))).onConflictDoNothing();
    }

    await tx
      .update(sourceRow)
      .set({ status: rowStatus, reason: reasons[0] ?? null, productId })
      .where(and(eq(sourceRow.importId, group.importId), eq(sourceRow.groupKey, group.groupKey), eq(sourceRow.status, "pending")));

    await tx.update(importGroup).set({ status: rowStatus, reason: reviewReason, productId }).where(eq(importGroup.id, group.id));
    await recordCalls(tx, calls, { storeId: group.storeId, importId: group.importId, groupId: group.id, productId });

    const [saved] = await tx.select().from(product).where(eq(product.id, productId));
    return saved;
  });
}

async function failGroup(group: typeof importGroup.$inferSelect, reason: string, calls: AiCallRecord[]) {
  await db.transaction(async (tx) => {
    await tx
      .update(sourceRow)
      .set({ status: "failed", reason })
      .where(and(eq(sourceRow.importId, group.importId), eq(sourceRow.groupKey, group.groupKey), eq(sourceRow.status, "pending")));
    await tx.update(importGroup).set({ status: "failed", reason }).where(eq(importGroup.id, group.id));
    await recordCalls(tx, calls, { storeId: group.storeId, importId: group.importId, groupId: group.id });
  });
  log.warn("group failed", { importId: group.importId, groupId: group.id, reason });
}

/** Called once BullMQ has given up on a build job (retries used up or stalled too often) so its rows do not stay pending. */
export async function abandonBuild(job: Job<BuildJob>, error: Error) {
  const [group] = await db.select().from(importGroup).where(eq(importGroup.id, job.data.groupId));
  if (!group || group.status !== "pending") return;
  await failGroup(group, `Gave up after ${job.attemptsMade} attempt(s): ${error.message}`, []);
  await refreshCounts(group.importId);
}

export async function runBuild(job: Job<BuildJob>, worker: Worker) {
  const { importId, groupId } = job.data;
  const [group] = await db.select().from(importGroup).where(eq(importGroup.id, groupId));
  if (!group || group.status !== "pending") return { skipped: true };
  const [imp] = await db.select({ status: importJob.status }).from(importJob).where(eq(importJob.id, importId));
  if (!imp || imp.status === "cancelled" || imp.status === "failed") return { skipped: true };

  const config = env();
  await waitIfPaused(worker);

  const input = group.input as GroupInput;
  const model = config.AI_MODE === "mock" ? "mock" : group.route === "strong" ? config.AI_MODEL_STRONG : config.AI_MODEL_FAST;
  const promptVersion = loadPrompt("build-product").version;
  const cacheKey = sha256(`build|${model}|${promptVersion}|${group.inputHash}`);

  let output: BuildOutput | null = null;
  let calls: AiCallRecord[] = [];

  const [cached] = await db.select().from(aiResult).where(eq(aiResult.key, cacheKey));
  if (cached) output = cached.output as BuildOutput;
  else if (config.AI_MODE !== "mock" && (await overBudget(importId))) return { skipped: "budget" };
  else if (config.AI_MODE === "mock") {
    if (config.MOCK_LATENCY_MS) await new Promise((resolve) => setTimeout(resolve, config.MOCK_LATENCY_MS));
    output = mockBuild(input, "Built in demo mode without AI");
  }
  else {
    try {
      const maxOutputTokens = Math.min(16_384, 4096 * 2 ** job.attemptsMade);
      const result = await generateBuild(input, model, { withPhotos: group.route === "strong" && input.photos.length > 0, maxOutputTokens });
      output = result.output;
      calls = result.calls;
      await db.insert(aiResult).values({ key: cacheKey, output }).onConflictDoNothing();
    } catch (raw) {
      calls = (raw as { calls?: AiCallRecord[] }).calls ?? [];
      const error = classify(raw);
      const record = () => recordCalls(db, calls, { storeId: group.storeId, importId, groupId });
      await pauseOnAiError(worker, error, record);
      if (error.kind === "blocked") {
        output = mockBuild(input, error.message);
      } else if (!error.retryable || isFinalAttempt(job)) {
        await failGroup(group, error.message, calls);
        await refreshCounts(importId);
        return { failed: error.message };
      } else {
        await record();
        throw error;
      }
    }
  }

  const built = finalizeBuild(input, output);
  const saved = await persist(group, input, built, calls);
  await recordProviderSuccess(importId);

  await enqueueTranslate(saved.id, englishSourceHash(saved));
  await refreshCounts(importId);
  return { productId: saved.id, status: saved.status, model, cached: !!cached };
}


const RERUN_FIELDS: Record<string, (b: BuiltProduct) => Partial<typeof product.$inferInsert>> = {
  title: (b) => ({ title: b.title }),
  description_html: (b) => ({ descriptionHtml: b.descriptionHtml }),
  category: (b) => ({ category: b.category }),
  attributes: (b) => ({ attributes: b.attributes, tags: b.tags }),
  claims: (b) => ({ claims: b.claims }),
  seo: (b) => ({ seo: b.seo }),
};

export async function runRerun(job: Job<RerunJob>, worker: Worker) {
  const { productId, model, fields, note } = job.data;
  const [current] = await db.select().from(product).where(eq(product.id, productId));
  if (!current || current.deletedAt) return { skipped: true };
  const [group] = await db.select().from(importGroup).where(eq(importGroup.productId, productId)).orderBy(sql`${importGroup.createdAt} desc`).limit(1);
  if (!group) return { skipped: true, reason: "No source rows for this product" };

  const config = env();
  await waitIfPaused(worker);

  const input = group.input as GroupInput;
  let output: BuildOutput;
  let calls: AiCallRecord[] = [];
  if (config.AI_MODE === "mock") {
    output = mockBuild(input, "Re-run in demo mode without AI");
  } else {
    try {
      const result = await generateBuild(input, model, { withPhotos: input.photos.length > 0, maxOutputTokens: Math.min(16_384, 4096 * 2 ** job.attemptsMade), note });
      output = result.output;
      calls = result.calls;
    } catch (raw) {
      calls = (raw as { calls?: AiCallRecord[] }).calls ?? [];
      const error = classify(raw);
      await recordCalls(db, calls, { storeId: current.storeId, importId: current.lastImportId, productId });
      await pauseOnAiError(worker, error);
      if (!error.retryable || isFinalAttempt(job)) {
        await db.update(product).set({ status: "needs_review", reviewReason: `Re-run failed: ${error.message}` }).where(eq(product.id, productId));
        await refreshProductEvent(current.storeId, productId);
        return { failed: error.message };
      }
      throw error;
    }
  }

  const built = finalizeBuild(input, output);
  const manual = new Set(current.manualFields);
  const changes: Partial<typeof product.$inferInsert> = { confidence: { ...current.confidence, ...built.confidence } };
  for (const field of fields) {
    if (manual.has(field) || !RERUN_FIELDS[field]) continue;
    Object.assign(changes, RERUN_FIELDS[field](built));
  }
  const status = built.reviewReasons.length > 0 ? ("needs_review" as const) : ("ready" as const);

  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(product)
      .set({ ...changes, status, reviewReason: built.reviewReasons.join("; ") || null })
      .where(eq(product.id, productId))
      .returning();
    await recordCalls(tx, calls, { storeId: current.storeId, importId: current.lastImportId, productId });
    return row;
  });

  await recordProviderSuccess(current.lastImportId);
  await enqueueTranslate(saved.id, englishSourceHash(saved));
  await refreshProductEvent(current.storeId, productId);
  return { productId, status, model };
}

async function refreshProductEvent(storeId: string, productId: string) {
  await publish({ type: "product.updated", storeId, productId });
}
