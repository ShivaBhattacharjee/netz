import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { evalSet, upload } from "@/db/schema";
import { newId } from "../ids";
import { buildGroups, cleanRows, sheetDecimalHint } from "../pipeline/group";
import { detectHeader } from "../pipeline/headers";
import { SheetError, parseSheet } from "../pipeline/sheet";
import { storage } from "../storage";

const duplicateRow = z.object({ row: z.number().int(), duplicate_of: z.number().int() });

const labelProduct = z.object({
  group: z.string().min(1),
  source_rows: z.array(z.number().int()),
  category: z.string(),
  attributes: z.record(z.string(), z.string()).default({}),
  variants: z.array(
    z.object({
      sku: z.string(),
      options: z.record(z.string(), z.string()).default({}),
      price_cents: z.number().int().nullable(),
      currency: z.string(),
      weight_grams: z.number().nullable(),
    }),
  ),
  allowed_claims: z.array(z.object({ text: z.string() })).default([]),
  forbidden_claims: z.array(z.string()).default([]),
  expected_status: z.enum(["ready", "needs_review"]),
  duplicate_rows: z.array(duplicateRow).optional(),
});

const labelsSchema = z.object({
  total_rows: z.number().int().min(0),
  products: z.array(labelProduct).min(1, "labels.json has no products"),
  duplicate_rows: z.array(duplicateRow).optional(),
});

export type Labels = z.infer<typeof labelsSchema>;
export type LabelProduct = Labels["products"][number];

export const createEvalSetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name the set")
    .max(80),
  sheet_upload_id: z.string().min(1),
  labels: z.unknown(),
});

export class EvalSetError extends Error {}

const sheetKind = (mime: string) => (mime.includes("spreadsheetml") ? "xlsx" : "csv");

export function groupSheet(buffer: Buffer, kind: "csv" | "xlsx") {
  const parsed = parseSheet(buffer, kind);
  const header = detectHeader(parsed.rows);
  if (!header) throw new EvalSetError("The sheet has no header row");
  const dataRows = parsed.rows
    .slice(header.index + 1)
    .map((raw, i) => ({ row: header.index + 2 + i, raw }))
    .filter((r) => r.raw.some((c) => c.trim() !== ""));
  const cleaned = cleanRows(dataRows, header, "EUR", sheetDecimalHint(dataRows.map((r) => r.raw), header));
  return buildGroups(cleaned, "EUR").groups;
}

function parseLabels(raw: unknown): Labels {
  const result = labelsSchema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new EvalSetError(`labels.json is not valid: ${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`);
}

export async function listEvalSets(storeId: string) {
  const rows = await db
    .select({ id: evalSet.id, name: evalSet.name, products: evalSet.products, rows: evalSet.rows, fileName: upload.fileName, createdAt: evalSet.createdAt })
    .from(evalSet)
    .innerJoin(upload, eq(upload.id, evalSet.sheetUploadId))
    .where(eq(evalSet.storeId, storeId))
    .orderBy(desc(evalSet.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, products: r.products, rows: r.rows, file_name: r.fileName, created_at: r.createdAt.toISOString() }));
}

export async function createEvalSet(storeId: string, userId: string | null, input: z.infer<typeof createEvalSetSchema>) {
  const labels = parseLabels(input.labels);
  const [sheet] = await db
    .select()
    .from(upload)
    .where(and(eq(upload.id, input.sheet_upload_id), eq(upload.storeId, storeId), eq(upload.kind, "sheet")));
  if (!sheet) throw new EvalSetError("Sheet upload not found");
  const [taken] = await db.select({ id: evalSet.id }).from(evalSet).where(and(eq(evalSet.storeId, storeId), eq(evalSet.name, input.name)));
  if (taken) throw new EvalSetError(`A set named "${input.name}" already exists`);

  let groups;
  try {
    groups = groupSheet(await storage.read(sheet.storageKey), sheetKind(sheet.mime));
  } catch (error) {
    if (error instanceof SheetError) throw new EvalSetError(error.message);
    throw error;
  }
  const keys = new Set(groups.map((g) => g.group_key));
  const matched = labels.products.filter((p) => keys.has(p.group)).length;
  if (!matched) {
    throw new EvalSetError(`None of the ${labels.products.length} labelled products match a product group in ${sheet.fileName}. Check that labels.json belongs to this sheet.`);
  }

  const id = newId("evset");
  const labelsKey = `evals/${storeId}/${id}.json`;
  await storage.writeBuffer(labelsKey, Buffer.from(JSON.stringify(labels)));
  await db.insert(evalSet).values({ id, storeId, name: input.name, sheetUploadId: sheet.id, labelsKey, products: labels.products.length, rows: labels.total_rows, createdBy: userId });
  return { id, matched };
}

export async function deleteEvalSet(storeId: string, id: string) {
  const [row] = await db.delete(evalSet).where(and(eq(evalSet.id, id), eq(evalSet.storeId, storeId))).returning();
  if (!row) throw new EvalSetError("Eval set not found");
  await storage.remove(row.labelsKey);
}

export async function loadEvalSet(storeId: string, id: string) {
  const [row] = await db
    .select({ labelsKey: evalSet.labelsKey, sheetKey: upload.storageKey, mime: upload.mime })
    .from(evalSet)
    .innerJoin(upload, eq(upload.id, evalSet.sheetUploadId))
    .where(and(eq(evalSet.id, id), eq(evalSet.storeId, storeId)));
  if (!row) throw new EvalSetError("The eval set was deleted");
  const labels = JSON.parse((await storage.read(row.labelsKey)).toString("utf8")) as Labels;
  return { groups: groupSheet(await storage.read(row.sheetKey), sheetKind(row.mime)), labels };
}
