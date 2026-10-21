import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { aiCall, importJob } from "@/db/schema";
import type { AiCallRecord } from "../ai/build";
import { costMicros } from "../ai/pricing";
import { newId } from "../ids";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordCalls(
  executor: Pick<Tx, "insert" | "update">,
  calls: AiCallRecord[],
  ctx: { storeId: string; importId: string | null; groupId?: string | null; productId?: string | null },
) {
  if (calls.length === 0) return;
  const rows = calls.map((c) => ({
    id: newId("call"),
    storeId: ctx.storeId,
    importId: ctx.importId,
    groupId: ctx.groupId ?? null,
    productId: ctx.productId ?? null,
    task: c.task,
    model: c.model,
    promptVersion: c.promptVersion,
    inputTokens: c.usage.inputTokens,
    outputTokens: c.usage.outputTokens,
    costMicros: costMicros(c.model, c.usage.inputTokens, c.usage.outputTokens),
    latencyMs: c.latencyMs,
    ok: c.ok,
    errorCode: c.errorCode,
  }));
  await executor.insert(aiCall).values(rows);
  const total = rows.reduce((sum, r) => sum + r.costMicros, 0);
  if (ctx.importId && total > 0) {
    await executor.update(importJob).set({ costMicros: sql`${importJob.costMicros} + ${total}` }).where(eq(importJob.id, ctx.importId));
  }
}
