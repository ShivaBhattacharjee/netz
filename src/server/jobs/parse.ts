import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { importGroup, importJob, photo, product, sourceRow, upload } from "@/db/schema";
import { newId } from "../ids";
import { log } from "../log";
import { detectHeader } from "../pipeline/headers";
import { buildGroups, cleanRows, groupInputHash, sheetDecimalHint } from "../pipeline/group";
import { type PhotoCandidate, PhotoArchiveError, extractZip, processPhotos } from "../pipeline/photos";
import { chooseRoute } from "../pipeline/route";
import { SheetError, parseSheet } from "../pipeline/sheet";
import { type ParseJob, enqueueBuilds } from "../queues";
import { storage } from "../storage";
import { budgetFor, estimateMicros } from "./budget";
import { failImport, refreshCounts } from "./progress";

export const MAX_ROWS = 10_000;
const INSERT_CHUNK = 1000;

class ImportRejected extends Error {}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function* photoCandidates(uploads: (typeof upload.$inferSelect)[]): AsyncGenerator<PhotoCandidate | { skipped: string; reason: string }> {
  for (const u of uploads) {
    if (u.kind === "zip") yield* extractZip(u.storageKey);
    else yield { fileName: u.fileName, data: await storage.read(u.storageKey) };
  }
}

export async function enqueuePendingGroups(importId: string) {
  const pending = await db
    .select({ id: importGroup.id, route: importGroup.route })
    .from(importGroup)
    .where(and(eq(importGroup.importId, importId), eq(importGroup.status, "pending")));
  if (pending.length > 0) await enqueueBuilds(importId, pending);
  return pending.length;
}

export async function runParse(job: Job<ParseJob>) {
  const { importId } = job.data;
  const [imp] = await db.select().from(importJob).where(eq(importJob.id, importId));
  if (!imp || ["completed", "failed", "cancelled"].includes(imp.status)) return { skipped: true };

  const [existing] = await db.select({ id: importGroup.id }).from(importGroup).where(eq(importGroup.importId, importId)).limit(1);
  const [existingRow] = await db.select({ n: sourceRow.rowNumber }).from(sourceRow).where(eq(sourceRow.importId, importId)).limit(1);
  if (existing || existingRow) {
    const queued = await enqueuePendingGroups(importId);
    await refreshCounts(importId);
    return { resumed: true, queued };
  }

  await db.update(importJob).set({ status: "processing", startedAt: imp.startedAt ?? new Date() }).where(eq(importJob.id, importId));

  try {
    const [sheetUpload] = await db.select().from(upload).where(eq(upload.id, imp.sheetUploadId));
    if (!sheetUpload) throw new ImportRejected("The uploaded sheet is missing");
    const kind = sheetUpload.mime.includes("spreadsheetml") ? "xlsx" : "csv";
    const sheet = parseSheet(await storage.read(sheetUpload.storageKey), kind);

    const header = detectHeader(sheet.rows);
    if (!header) throw new ImportRejected("Could not find a header row in the first 20 rows (expected columns like SKU, Title, Price)");

    const dataRows = sheet.rows
      .slice(header.index + 1)
      .map((raw, i) => ({ row: header.index + 2 + i, raw }))
      .filter((r) => r.raw.some((c) => c.trim() !== ""));
    if (dataRows.length === 0) throw new ImportRejected("No data rows under the header");
    if (dataRows.length > MAX_ROWS) {
      throw new ImportRejected(`${dataRows.length.toLocaleString("en")} rows, the limit is ${MAX_ROWS.toLocaleString("en")}. Nothing was processed.`);
    }

    const hint = sheetDecimalHint(dataRows.map((r) => r.raw), header);
    const cleaned = cleanRows(dataRows, header, imp.defaultCurrency, hint);
    const { outcomes, groups } = buildGroups(cleaned, imp.defaultCurrency);
    const outcomeByRow = new Map(outcomes.map((o) => [o.row, o]));

    const explicit = new Map<string, string>();
    for (const r of cleaned) {
      const key = outcomeByRow.get(r.row)?.groupKey;
      if (key) for (const name of r.images) explicit.set(name.toLowerCase(), key);
    }

    const photoUploads = imp.photoUploadIds.length
      ? await db.select().from(upload).where(and(inArray(upload.id, imp.photoUploadIds), eq(upload.storeId, imp.storeId)))
      : [];
    const photos = await processPhotos(photoCandidates(photoUploads), groups, explicit);

    const uploadedNames = new Set(photos.map((p) => p.fileName.toLowerCase()));
    const groupByKey = new Map(groups.map((g) => [g.group_key, g]));
    for (const r of cleaned) {
      const g = groupByKey.get(outcomeByRow.get(r.row)?.groupKey ?? "");
      for (const name of r.images) {
        if (g && !uploadedNames.has(name.toLowerCase())) g.notes.push(`Row ${r.row} references ${name}, which was not uploaded`);
      }
    }

    const existingProducts = groups.length
      ? await db
          .select({ id: product.id, groupKey: product.groupKey, inputHash: product.inputHash, deletedAt: product.deletedAt })
          .from(product)
          .where(and(eq(product.storeId, imp.storeId), inArray(product.groupKey, groups.map((g) => g.group_key))))
      : [];
    const productByKey = new Map(existingProducts.map((p) => [p.groupKey, p]));

    const groupRows = groups.map((g) => {
      const inputHash = groupInputHash(g);
      const { route, reasons } = chooseRoute(g);
      const prior = productByKey.get(g.group_key);
      let status: "pending" | "skipped" = "pending";
      let reason: string | null = null;
      if (prior?.deletedAt) {
        status = "skipped";
        reason = "Skipped: deleted by merchant";
      } else if (prior && prior.inputHash === inputHash) {
        status = "skipped";
        reason = "Unchanged since last import";
      }
      return {
        id: newId("grp"),
        importId,
        storeId: imp.storeId,
        groupKey: g.group_key,
        input: g,
        inputHash,
        route,
        routeReasons: reasons,
        status,
        reason,
        productId: status === "skipped" && !prior?.deletedAt ? prior!.id : null,
      };
    });
    const skippedByKey = new Map(groupRows.filter((g) => g.status === "skipped").map((g) => [g.groupKey, g]));
    const estimate = estimateMicros(groupRows.filter((g) => g.status === "pending"));

    const rowValues = cleaned.map((r) => {
      const o = outcomeByRow.get(r.row)!;
      const skipped = o.groupKey ? skippedByKey.get(o.groupKey) : undefined;
      return {
        importId,
        storeId: imp.storeId,
        rowNumber: r.row,
        cells: r.cells,
        normalized: {
          sku: r.sku,
          title: r.title,
          price_cents: r.price?.cents ?? null,
          currency: r.price?.currency ?? null,
          size: r.size,
          color: r.color?.value ?? null,
          weight_grams: r.weightGrams,
          repairs: r.repairs,
        },
        rowHash: r.hash,
        groupKey: o.groupKey,
        status: skipped ? ("done" as const) : o.status,
        reason: skipped ? skipped.reason : o.reason,
        productId: skipped?.productId ?? null,
      };
    });

    await db.transaction(async (tx) => {
      for (const part of chunks(rowValues, INSERT_CHUNK)) await tx.insert(sourceRow).values(part).onConflictDoNothing();
      for (const part of chunks(groupRows, 200)) await tx.insert(importGroup).values(part).onConflictDoNothing();
      for (const part of chunks(photos, INSERT_CHUNK)) {
        if (part.length) await tx.insert(photo).values(part.map((p) => ({ id: newId("ph"), importId, storeId: imp.storeId, ...p }))).onConflictDoNothing();
      }
      await tx
        .update(importJob)
        .set({
          totalRows: cleaned.length,
          photoCount: photos.filter((p) => p.status !== "invalid").length,
          unmatchedPhotos: photos.filter((p) => p.status === "unmatched").map((p) => p.fileName),
          estimateMicros: estimate,
          budgetMicros: budgetFor(estimate),
        })
        .where(eq(importJob.id, importId));
    });

    const queued = await enqueuePendingGroups(importId);
    await refreshCounts(importId);
    log.info("import parsed", { importId, rows: cleaned.length, groups: groups.length, queued, encoding: sheet.encoding });
    return { rows: cleaned.length, groups: groups.length, queued };
  } catch (error) {
    if (error instanceof ImportRejected || error instanceof SheetError || error instanceof PhotoArchiveError) {
      await failImport(importId, error.message);
      return { failed: error.message };
    }
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (final) await failImport(importId, `Import failed: ${(error as Error).message}`);
    throw error;
  }
}
