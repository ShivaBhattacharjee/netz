import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { importJob, sourceRow, store, upload } from "@/db/schema";
import type { ImportJob, ImportRow } from "@/lib/types";
import { newId } from "./ids";
import { log } from "./log";
import { MAX_PHOTOS } from "./pipeline/photos";
import { enqueueParse } from "./queues";

export const createImportSchema = z.object({
  sheet_upload_id: z.string().min(1),
  photo_upload_ids: z.array(z.string().min(1)).max(MAX_PHOTOS).default([]),
  default_currency: z.enum(["EUR", "GBP", "USD", "CHF"]).optional(),
});

export class ImportInputError extends Error {}

function toImportJob(row: typeof importJob.$inferSelect): ImportJob {
  const resume = row.status === "paused" && row.pausedUntil ? Math.max(0, Math.ceil((row.pausedUntil.getTime() - Date.now()) / 1000)) : null;
  return {
    id: row.id,
    store_id: row.storeId,
    file_name: row.fileName,
    file_bytes: row.fileBytes,
    photo_count: row.photoCount,
    total_rows: row.totalRows,
    counts: row.counts,
    status: row.status,
    resume_in_seconds: resume,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    unmatched_photos: row.unmatchedPhotos,
    cost_micros: row.costMicros,
  };
}

export async function createImport(storeId: string, userId: string, input: z.infer<typeof createImportSchema>) {
  const ids = [input.sheet_upload_id, ...input.photo_upload_ids];
  const uploads = await db.select().from(upload).where(and(eq(upload.storeId, storeId), inArray(upload.id, ids)));
  const byId = new Map(uploads.map((u) => [u.id, u]));

  const sheet = byId.get(input.sheet_upload_id);
  if (!sheet || sheet.kind !== "sheet") throw new ImportInputError("sheet_upload_id is not a sheet uploaded to this store");
  const missing = input.photo_upload_ids.filter((id) => byId.get(id)?.kind !== "photo" && byId.get(id)?.kind !== "zip");
  if (missing.length) throw new ImportInputError(`Not a photo or ZIP upload in this store: ${missing.slice(0, 5).join(", ")}`);

  const [owner] = await db.select({ currency: store.defaultCurrency }).from(store).where(eq(store.id, storeId));
  const [created] = await db
    .insert(importJob)
    .values({
      id: newId("imp"),
      storeId,
      createdBy: userId,
      sheetUploadId: sheet.id,
      photoUploadIds: [...new Set(input.photo_upload_ids)],
      fileName: sheet.fileName,
      fileBytes: sheet.bytes,
      fileSha256: sheet.sha256,
      defaultCurrency: input.default_currency ?? owner?.currency ?? "EUR",
    })
    .returning();

  try {
    await enqueueParse(created.id);
  } catch (error) {
    log.warn("enqueue failed, reconciler will pick the import up", { importId: created.id, error: (error as Error).message });
  }
  return toImportJob(created);
}

export async function listImports(storeId: string, limit = 50) {
  const rows = await db.select().from(importJob).where(eq(importJob.storeId, storeId)).orderBy(desc(importJob.createdAt)).limit(limit);
  return rows.map(toImportJob);
}

export async function getImport(storeId: string, importId: string, page: { offset: number; limit: number }) {
  const [row] = await db.select().from(importJob).where(and(eq(importJob.id, importId), eq(importJob.storeId, storeId)));
  if (!row) return null;
  const rows = await db
    .select()
    .from(sourceRow)
    .where(eq(sourceRow.importId, importId))
    .orderBy(asc(sourceRow.rowNumber))
    .limit(page.limit)
    .offset(page.offset);
  const items: ImportRow[] = rows.map((r) => {
    const n = r.normalized as { sku?: string | null; title?: string };
    return { row: r.rowNumber, sku: n.sku ?? "", title: n.title ?? "", status: r.status, product_id: r.productId, reason: r.reason };
  });
  return { import: toImportJob(row), rows: items };
}
