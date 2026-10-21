import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { importGroup, importJob, photo, product, sourceRow, store, upload } from "@/db/schema";
import type { ImportJob, ImportRow } from "@/lib/types";
import { newId } from "./ids";
import { log } from "./log";
import { MAX_PHOTOS } from "./pipeline/photos";
import { isBudgetPaused } from "./jobs/budget";
import { refreshCounts } from "./jobs/progress";
import { enqueueBuilds, enqueueParse } from "./queues";

export const createImportSchema = z.object({
  sheet_upload_id: z.string().min(1),
  photo_upload_ids: z.array(z.string().min(1)).max(MAX_PHOTOS).default([]),
  default_currency: z.enum(["EUR", "GBP", "USD", "CHF"]).optional(),
});

export class ImportInputError extends Error {}

const MAX_RUNNING_IMPORTS = 3;

async function unmatchedPhotoUrls(importIds: string[]) {
  if (importIds.length === 0) return new Map<string, Map<string, string>>();
  const rows = await db
    .select({ id: photo.id, importId: photo.importId, fileName: photo.fileName })
    .from(photo)
    .where(and(inArray(photo.importId, importIds), eq(photo.status, "unmatched")));
  const byImport = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (!r.importId) continue;
    const map = byImport.get(r.importId) ?? new Map<string, string>();
    map.set(r.fileName, `/api/photos/${r.id}`);
    byImport.set(r.importId, map);
  }
  return byImport;
}

function toImportJob(row: typeof importJob.$inferSelect, urls?: Map<string, string>): ImportJob {
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
    unmatched_photos: row.unmatchedPhotos.map((name) => ({ name, url: urls?.get(name) ?? null })),
    cost_micros: row.costMicros,
    estimate_micros: row.estimateMicros,
    budget_micros: row.budgetMicros,
    budget_paused: isBudgetPaused(row),
  };
}

export async function createImport(storeId: string, userId: string | null, input: z.infer<typeof createImportSchema>) {
  const ids = [input.sheet_upload_id, ...input.photo_upload_ids];
  const uploads = await db.select().from(upload).where(and(eq(upload.storeId, storeId), inArray(upload.id, ids)));
  const byId = new Map(uploads.map((u) => [u.id, u]));

  const sheet = byId.get(input.sheet_upload_id);
  if (!sheet || sheet.kind !== "sheet") throw new ImportInputError("sheet_upload_id is not a sheet uploaded to this store");
  const missing = input.photo_upload_ids.filter((id) => byId.get(id)?.kind !== "photo" && byId.get(id)?.kind !== "zip");
  if (missing.length) throw new ImportInputError(`Not a photo or ZIP upload in this store: ${missing.slice(0, 5).join(", ")}`);

  const [{ running }] = await db
    .select({ running: count() })
    .from(importJob)
    .where(and(eq(importJob.storeId, storeId), inArray(importJob.status, ["queued", "processing", "paused"])));
  if (running >= MAX_RUNNING_IMPORTS) {
    throw new ImportInputError(`At most ${MAX_RUNNING_IMPORTS} imports can run at once. Wait for one to finish or cancel it.`);
  }

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
  const urls = await unmatchedPhotoUrls(rows.filter((r) => r.unmatchedPhotos.length).map((r) => r.id));
  return rows.map((r) => toImportJob(r, urls.get(r.id)));
}

export async function getImport(
  storeId: string,
  importId: string,
  page: { offset: number; limit: number; status?: (typeof sourceRow.$inferSelect)["status"] },
) {
  const [row] = await db.select().from(importJob).where(and(eq(importJob.id, importId), eq(importJob.storeId, storeId)));
  if (!row) return null;
  const rows = await db
    .select()
    .from(sourceRow)
    .where(page.status ? and(eq(sourceRow.importId, importId), eq(sourceRow.status, page.status)) : eq(sourceRow.importId, importId))
    .orderBy(asc(sourceRow.rowNumber))
    .limit(page.limit)
    .offset(page.offset);
  const items: ImportRow[] = rows.map((r) => {
    const n = r.normalized as { sku?: string | null; title?: string };
    return { row: r.rowNumber, sku: n.sku ?? "", title: n.title ?? "", status: r.status, product_id: r.productId, reason: r.reason };
  });
  const urls = await unmatchedPhotoUrls([row.id]);
  return { import: toImportJob(row, urls.get(row.id)), rows: items };
}

async function ownedImport(storeId: string, importId: string) {
  const [row] = await db.select().from(importJob).where(and(eq(importJob.id, importId), eq(importJob.storeId, storeId)));
  if (!row) throw new ImportInputError("Import not found");
  return row;
}

export async function getImportRow(storeId: string, importId: string, rowNumber: number) {
  await ownedImport(storeId, importId);
  const [row] = await db.select().from(sourceRow).where(and(eq(sourceRow.importId, importId), eq(sourceRow.rowNumber, rowNumber)));
  if (!row) return null;
  const [linked] = row.productId
    ? await db
        .select({ id: product.id, title: product.title, status: product.status, reviewReason: product.reviewReason })
        .from(product)
        .where(eq(product.id, row.productId))
    : [];
  const normalized = row.normalized as { sku?: string | null; title?: string; repairs?: string[] };
  const duplicateOf = row.reason?.match(/^Duplicate of row (\d+)$/)?.[1];
  const retryable = row.status === "failed" && row.groupKey !== null;
  return {
    row: row.rowNumber,
    sku: normalized.sku ?? "",
    title: normalized.title ?? "",
    status: row.status,
    reason: row.reason,
    cells: row.cells,
    repairs: normalized.repairs ?? [],
    group_key: row.groupKey,
    duplicate_of: duplicateOf ? Number(duplicateOf) : null,
    retryable,
    product: linked ? { id: linked.id, title: linked.title, status: linked.status, review_reason: linked.reviewReason } : null,
  };
}

export async function cancelImport(storeId: string, importId: string) {
  const imp = await ownedImport(storeId, importId);
  if (!["queued", "processing", "paused"].includes(imp.status)) throw new ImportInputError("Only running imports can be cancelled");
  await db.transaction(async (tx) => {
    await tx.update(importJob).set({ status: "cancelled", error: "Cancelled. Rows already finished are kept.", finishedAt: new Date(), pausedUntil: null }).where(eq(importJob.id, importId));
    await tx.update(importGroup).set({ status: "failed", reason: "Import cancelled" }).where(and(eq(importGroup.importId, importId), eq(importGroup.status, "pending")));
    await tx.update(sourceRow).set({ status: "failed", reason: "Import cancelled before this row was processed" }).where(and(eq(sourceRow.importId, importId), eq(sourceRow.status, "pending")));
  });
  await refreshCounts(importId);
}

export async function deleteImport(storeId: string, importId: string) {
  const imp = await ownedImport(storeId, importId);
  if (["queued", "processing", "paused"].includes(imp.status)) throw new ImportInputError("Cancel the import before deleting it");
  await db.delete(importJob).where(eq(importJob.id, importId));
}

export async function retryImport(storeId: string, importId: string, groupKey?: string) {
  const imp = await ownedImport(storeId, importId);
  const attempt = `r${Date.now().toString(36)}`;

  const [anyGroup] = await db.select({ id: importGroup.id }).from(importGroup).where(eq(importGroup.importId, importId)).limit(1);
  if (imp.status === "failed" && !anyGroup) {
    await db.update(importJob).set({ status: "queued", error: null, finishedAt: null }).where(eq(importJob.id, importId));
    await enqueueParse(importId, attempt);
    return { retried: "import" as const };
  }

  const groupFilter = and(eq(importGroup.importId, importId), eq(importGroup.status, "failed"), groupKey ? eq(importGroup.groupKey, groupKey) : undefined);
  const groups = await db.select({ id: importGroup.id, route: importGroup.route, groupKey: importGroup.groupKey }).from(importGroup).where(groupFilter);
  if (groups.length === 0) throw new ImportInputError("Nothing to retry: failed rows without a product group (for example rows with no title) need a fixed sheet");

  await db.transaction(async (tx) => {
    await tx.update(importGroup).set({ status: "pending", reason: null }).where(inArray(importGroup.id, groups.map((g) => g.id)));
    await tx
      .update(sourceRow)
      .set({ status: "pending", reason: null })
      .where(and(eq(sourceRow.importId, importId), eq(sourceRow.status, "failed"), isNotNull(sourceRow.groupKey), inArray(sourceRow.groupKey, groups.map((g) => g.groupKey))));
    await tx.update(importJob).set({ status: "processing", error: null, finishedAt: null }).where(eq(importJob.id, importId));
  });
  await enqueueBuilds(importId, groups, attempt);
  await refreshCounts(importId);
  return { retried: "groups" as const, count: groups.length };
}
