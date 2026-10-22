import type { Job, Worker } from "bullmq";
import { and, asc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { importGroup, importJob, photo, product, productPhoto } from "@/db/schema";
import type { AiCallRecord } from "../ai/build";
import { classify } from "../ai/anthropic";
import { AUTO_ATTACH_CONFIDENCE, type MatchCandidate, SUGGEST_CONFIDENCE, matchPhoto, shortlist } from "../ai/match-photo";
import { env } from "../env";
import { log } from "../log";
import type { GroupInput } from "../pipeline/group";
import type { MatchPhotosJob } from "../queues";
import { recordCalls } from "./calls";
import { pauseOnAiError, recordProviderSuccess, waitIfPaused } from "./gate";
import { publish } from "./progress";

const VISIBLE_ATTRIBUTES = ["color", "material", "finish", "pattern", "shape"];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Attaches an unmatched photo to the product built from `groupKey`. Returns the product ID, or null when the photo was already handled. */
export async function attachPhoto(tx: Tx, photoId: string, groupKey: string, reason: string) {
  const [row] = await tx.select().from(photo).where(eq(photo.id, photoId)).for("update");
  if (!row?.importId || row.status !== "unmatched") return null;
  const [group] = await tx
    .select({ productId: importGroup.productId })
    .from(importGroup)
    .where(and(eq(importGroup.importId, row.importId), eq(importGroup.groupKey, groupKey)));
  if (!group?.productId) return null;

  await tx
    .update(photo)
    .set({ status: "matched", groupKey, reason, suggestedGroupKey: null, suggestionConfidence: null })
    .where(eq(photo.id, photoId));

  const [sameImage] = await tx
    .select({ id: photo.id })
    .from(productPhoto)
    .innerJoin(photo, eq(photo.id, productPhoto.photoId))
    .where(and(eq(productPhoto.productId, group.productId), eq(photo.sha256, row.sha256 ?? "")))
    .limit(1);
  if (!sameImage) {
    const [{ last }] = await tx.select({ last: max(productPhoto.position) }).from(productPhoto).where(eq(productPhoto.productId, group.productId));
    await tx.insert(productPhoto).values({ productId: group.productId, photoId, position: (last ?? -1) + 1 }).onConflictDoNothing();
  }
  await tx
    .update(importJob)
    .set({ unmatchedPhotos: sql`array_remove(${importJob.unmatchedPhotos}, ${row.fileName})` })
    .where(eq(importJob.id, row.importId));
  return group.productId;
}

async function candidatesFor(importId: string): Promise<MatchCandidate[]> {
  const groups = await db
    .select({ groupKey: importGroup.groupKey, input: importGroup.input, title: product.title, attributes: product.attributes })
    .from(importGroup)
    .innerJoin(product, eq(product.id, importGroup.productId))
    .where(and(eq(importGroup.importId, importId), isNull(product.deletedAt)))
    .orderBy(asc(importGroup.groupKey));
  return groups.map((g) => {
    const input = g.input as GroupInput;
    return {
      groupKey: g.groupKey,
      title: g.title,
      skus: input.variants.filter((v) => !v.sku_derived).map((v) => v.sku),
      options: [...new Set(input.variants.flatMap((v) => Object.entries(v.options).map(([k, value]) => `${k} ${value}`)))].slice(0, 12),
      details: VISIBLE_ATTRIBUTES.flatMap((key) => (g.attributes[key] ? [`${key} ${g.attributes[key]}`] : [])),
    };
  });
}

async function setStatus(importId: string, status: "running" | "done" | "failed") {
  const [row] = await db.update(importJob).set({ photoMatch: status }).where(eq(importJob.id, importId)).returning({ storeId: importJob.storeId });
  if (row) await publish({ type: "import.progress", importId, storeId: row.storeId });
}

/** Called once BullMQ has given up on a photo matching job. */
export async function abandonMatchPhotos(job: Job<MatchPhotosJob>) {
  await setStatus(job.data.importId, "failed");
}

export async function runMatchPhotos(job: Job<MatchPhotosJob>, worker: Worker) {
  const { importId } = job.data;
  const [imp] = await db.select({ storeId: importJob.storeId }).from(importJob).where(eq(importJob.id, importId));
  if (!imp) return { skipped: true };
  await setStatus(importId, "running");

  const candidates = await candidatesFor(importId);
  const pending = await db
    .select({ id: photo.id, fileName: photo.fileName, storageKey: photo.storageKey })
    .from(photo)
    .where(and(eq(photo.importId, importId), eq(photo.status, "unmatched"), isNull(photo.aiCheckedAt), isNotNull(photo.storageKey)))
    .orderBy(asc(photo.fileName));

  if (candidates.length === 0 && pending.length) {
    await db
      .update(photo)
      .set({ aiCheckedAt: new Date(), reason: "No products in this import to match against" })
      .where(inArray(photo.id, pending.map((p) => p.id)));
  }

  const model = env().AI_MODEL_FAST;
  let attached = 0;
  for (const p of candidates.length ? pending : []) {
    await waitIfPaused(worker);

    let result;
    try {
      result = await matchPhoto({ fileName: p.fileName, storageKey: p.storageKey! }, shortlist(candidates, p.fileName), model);
    } catch (raw) {
      const calls = (raw as { calls?: AiCallRecord[] }).calls ?? [];
      const error = classify(raw);
      const record = () => recordCalls(db, calls, { storeId: imp.storeId, importId });
      await pauseOnAiError(worker, error, record);
      await record();
      if (error.retryable) throw error;
      await db.update(photo).set({ aiCheckedAt: new Date(), reason: `AI could not check this photo: ${error.message}` }).where(eq(photo.id, p.id));
      continue;
    }

    const auto = result.groupKey && result.confidence >= AUTO_ATTACH_CONFIDENCE;
    const productId = await db.transaction(async (tx) => {
      await recordCalls(tx, result.calls, { storeId: imp.storeId, importId });
      if (auto) {
        const attachedTo = await attachPhoto(tx, p.id, result.groupKey!, `Matched by AI (${result.confidence}%): ${result.reason}`);
        if (attachedTo) {
          await tx.update(photo).set({ aiCheckedAt: new Date() }).where(eq(photo.id, p.id));
          return attachedTo;
        }
      }
      const suggest = result.groupKey && result.confidence >= SUGGEST_CONFIDENCE;
      await tx
        .update(photo)
        .set({
          aiCheckedAt: new Date(),
          suggestedGroupKey: suggest ? result.groupKey : null,
          suggestionConfidence: suggest ? result.confidence : null,
          reason: suggest ? result.reason : `No confident AI match: ${result.reason}`,
        })
        .where(eq(photo.id, p.id));
      return null;
    });
    if (productId) {
      attached++;
      await publish({ type: "product.updated", storeId: imp.storeId, productId });
    }
    await recordProviderSuccess(null);
    await publish({ type: "import.progress", importId, storeId: imp.storeId });
  }

  await setStatus(importId, "done");
  log.info("photos matched by AI", { importId, checked: pending.length, attached, candidates: candidates.length });
  return { checked: pending.length, attached };
}

export async function resolveSuggestion(storeId: string, importId: string, photoId: string, accept: boolean) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: photo.id, suggestedGroupKey: photo.suggestedGroupKey, suggestionConfidence: photo.suggestionConfidence, reason: photo.reason })
      .from(photo)
      .where(and(eq(photo.id, photoId), eq(photo.importId, importId), eq(photo.storeId, storeId), eq(photo.status, "unmatched")));
    if (!row?.suggestedGroupKey) return null;
    if (!accept) {
      await tx.update(photo).set({ suggestedGroupKey: null, suggestionConfidence: null, reason: "AI suggestion dismissed" }).where(eq(photo.id, photoId));
      return { productId: null };
    }
    const productId = await attachPhoto(tx, photoId, row.suggestedGroupKey, `AI match (${row.suggestionConfidence}%) confirmed by merchant: ${row.reason}`);
    return productId ? { productId } : null;
  });
}

export async function hasUnchecked(importId: string) {
  const [row] = await db
    .select({ id: photo.id })
    .from(photo)
    .where(and(eq(photo.importId, importId), eq(photo.status, "unmatched"), isNull(photo.aiCheckedAt)))
    .limit(1);
  return Boolean(row);
}
