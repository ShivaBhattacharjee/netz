import { count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { importJob, type RowCounts, sourceRow } from "@/db/schema";
import { log } from "../log";
import { redis } from "../redis";

export const EVENTS_CHANNEL = "catalog:events";

export async function publish(event: Record<string, unknown>) {
  try {
    await redis().publish(EVENTS_CHANNEL, JSON.stringify(event));
  } catch (error) {
    log.warn("event publish failed", { error: (error as Error).message });
  }
}

export async function refreshCounts(importId: string) {
  const rows = await db.select({ status: sourceRow.status, n: count() }).from(sourceRow).where(eq(sourceRow.importId, importId)).groupBy(sourceRow.status);
  const counts: RowCounts = { pending: 0, done: 0, needs_review: 0, failed: 0 };
  for (const r of rows) counts[r.status] = Number(r.n);

  const [current] = await db.select({ totalRows: importJob.totalRows, storeId: importJob.storeId }).from(importJob).where(eq(importJob.id, importId));
  if (!current) return;
  const sum = counts.pending + counts.done + counts.needs_review + counts.failed;
  const mismatch = sum !== current.totalRows ? `Row counts do not add up: ${sum} of ${current.totalRows}` : null;
  if (mismatch) log.error("row count invariant broken", { importId, sum, total: current.totalRows });

  await db.update(importJob).set({ counts }).where(eq(importJob.id, importId));

  let completed = false;
  if (counts.pending === 0) {
    const done = await db
      .update(importJob)
      .set({ status: "completed", finishedAt: new Date(), pausedUntil: null, ...(mismatch ? { error: mismatch } : {}) })
      .where(sql`${importJob.id} = ${importId} and ${inArray(importJob.status, ["processing", "paused"])}`)
      .returning({ id: importJob.id });
    completed = done.length > 0;
  }

  await publish({ type: completed ? "import.completed" : "import.progress", importId, storeId: current.storeId, counts });
  return counts;
}

export async function failImport(importId: string, error: string) {
  const [row] = await db
    .update(importJob)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(importJob.id, importId))
    .returning({ storeId: importJob.storeId });
  log.warn("import failed", { importId, error });
  if (row) await publish({ type: "import.failed", importId, storeId: row.storeId, error });
}
