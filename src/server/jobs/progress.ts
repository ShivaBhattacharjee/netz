import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { importJob, type RowCounts, sourceRow } from "@/db/schema";
import { env } from "../env";
import { log } from "../log";
import { enqueueMatchPhotos } from "../queues";
import { redis } from "../redis";
import { emitWebhook } from "../webhooks";

export const EVENTS_CHANNEL = "catalog:events";

export async function publish(event: Record<string, unknown>) {
  try {
    await redis().publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (error) {
    log.warn("event publish failed", { error: (error as Error).message });
  }
}

export async function refreshCounts(importId: string) {
  const result = await db.transaction(async (tx) => {
    // Lock before counting: concurrent refreshes otherwise let an older count overwrite a newer one.
    const [current] = await tx
      .select({ totalRows: importJob.totalRows, storeId: importJob.storeId })
      .from(importJob)
      .where(eq(importJob.id, importId))
      .for("update");
    if (!current) return null;

    const rows = await tx.select({ status: sourceRow.status, n: count() }).from(sourceRow).where(eq(sourceRow.importId, importId)).groupBy(sourceRow.status);
    const counts: RowCounts = { pending: 0, done: 0, needs_review: 0, failed: 0 };
    for (const r of rows) counts[r.status] = Number(r.n);

    const sum = counts.pending + counts.done + counts.needs_review + counts.failed;
    const mismatch = sum !== current.totalRows ? `Row counts do not add up: ${sum} of ${current.totalRows}` : null;
    if (mismatch) log.error("row count invariant broken", { importId, sum, total: current.totalRows });

    await tx.update(importJob).set({ counts }).where(eq(importJob.id, importId));

    let completed = false;
    if (counts.pending === 0) {
      const done = await tx
        .update(importJob)
        .set({ status: "completed", finishedAt: new Date(), pausedUntil: null, ...(mismatch ? { error: mismatch } : {}) })
        .where(sql`${importJob.id} = ${importId} and ${inArray(importJob.status, ["processing", "paused"])}`)
        .returning({ id: importJob.id });
      completed = done.length > 0;
    }
    return { current, counts, completed };
  });
  if (!result) return;
  const { current, counts, completed } = result;

  await publish({ type: completed ? "import.completed" : "import.progress", importId, storeId: current.storeId, counts });
  if (completed) {
    await startPhotoMatch(importId);
    const [done] = await db.select({ costMicros: importJob.costMicros, fileName: importJob.fileName, finishedAt: importJob.finishedAt }).from(importJob).where(eq(importJob.id, importId));
    await emitWebhook(current.storeId, "import.completed", {
      import_id: importId,
      file_name: done?.fileName,
      counts: { ...counts, total: current.totalRows },
      cost_usd: (done?.costMicros ?? 0) / 1_000_000,
      finished_at: done?.finishedAt?.toISOString(),
    });
  }
  return counts;
}

async function startPhotoMatch(importId: string) {
  if (env().AI_MODE !== "anthropic") return;
  try {
    const [queued] = await db
      .update(importJob)
      .set({ photoMatch: "queued" })
      .where(and(eq(importJob.id, importId), isNull(importJob.photoMatch), sql`cardinality(${importJob.unmatchedPhotos}) > 0`))
      .returning({ id: importJob.id });
    if (queued) await enqueueMatchPhotos(importId);
  } catch (error) {
    await db.update(importJob).set({ photoMatch: null }).where(and(eq(importJob.id, importId), eq(importJob.photoMatch, "queued")));
    log.warn("could not start photo matching", { importId, error: (error as Error).message });
  }
}

export async function failImport(importId: string, error: string) {
  const [row] = await db
    .update(importJob)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(importJob.id, importId))
    .returning({ storeId: importJob.storeId });
  log.warn("import failed", { importId, error });
  if (row) {
    await publish({ type: "import.failed", importId, storeId: row.storeId, error });
    await emitWebhook(row.storeId, "import.failed", { import_id: importId, error });
  }
}
