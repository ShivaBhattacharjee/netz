import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evalRun, type FieldScores } from "@/db/schema";
import { type AiCallRecord, type BuiltProduct, finalizeBuild, generateBuild } from "../ai/build";
import { classify } from "../ai/gemini";
import { mockBuild } from "../ai/mock";
import { costMicros } from "../ai/pricing";
import { env } from "../env";
import { scoreBuild, scoreCleaning } from "../evals/score";
import { loadEvalSet } from "../evals/sets";
import { buildGroups, cleanRows, sheetDecimalHint } from "../pipeline/group";
import { detectHeader } from "../pipeline/headers";
import { parseSheet } from "../pipeline/sheet";
import { recordCalls } from "./calls";

const PARALLEL = 4;
const MAX_RATE_LIMIT_WAITS = 5;

export interface EvalJob {
  runId: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runEval(job: Job<EvalJob>) {
  const [run] = await db.select().from(evalRun).where(eq(evalRun.id, job.data.runId));
  if (!run || run.status === "completed") return { skipped: true };

  try {
    const config = env();
    const { sheet, labels } = loadEvalSet(run.set);
    const parsed = parseSheet(sheet, "csv");
    const header = detectHeader(parsed.rows);
    if (!header) throw new Error("Eval sheet has no header row");
    const dataRows = parsed.rows
      .slice(header.index + 1)
      .map((raw, i) => ({ row: header.index + 2 + i, raw }))
      .filter((r) => r.raw.some((c) => c.trim() !== ""));
    const cleaned = cleanRows(dataRows, header, "EUR", sheetDecimalHint(dataRows.map((r) => r.raw), header));
    const { groups } = buildGroups(cleaned, "EUR");

    const scores: FieldScores = {};
    const notes: string[] = [];
    scoreCleaning(groups, labels, scores, notes);

    const byKey = new Map(groups.map((g) => [g.group_key, g]));
    const sample = labels.products.filter((l) => byKey.has(l.group)).slice(0, run.sampleLimit);
    await db.update(evalRun).set({ status: "running", total: sample.length, done: 0, scores }).where(eq(evalRun.id, run.id));

    let invented = 0;
    let failures = 0;
    let done = 0;
    const latencies: number[] = [];
    const calls: AiCallRecord[] = [];
    let next = 0;

    async function buildOne(index: number) {
      const label = sample[index];
      const group = byKey.get(label.group);
      if (!group) return;
      const model = run.model;
      let built: BuiltProduct | null = null;
      if (config.AI_MODE === "mock") {
        built = finalizeBuild(group, mockBuild(group, "Built in demo mode without AI"));
      } else {
        for (let waits = 0; ; waits++) {
          try {
            const result = await generateBuild(group, model, { withPhotos: false, maxOutputTokens: 4096, prompt: run.prompt });
            calls.push(...result.calls.map((c) => ({ ...c, task: "eval" as const })));
            latencies.push(result.calls.reduce((a, c) => a + c.latencyMs, 0));
            built = finalizeBuild(group, result.output);
            break;
          } catch (raw) {
            calls.push(...((raw as { calls?: AiCallRecord[] }).calls ?? []).map((c) => ({ ...c, task: "eval" as const })));
            const error = classify(raw);
            if ((error.kind === "rate_limit" || error.kind === "unavailable" || error.kind === "timeout") && waits < MAX_RATE_LIMIT_WAITS) {
              await sleep(error.retryAfterMs ?? 2000 * 2 ** waits);
              continue;
            }
            failures += 1;
            if (notes.length < 200) notes.push(`${label.group}: build failed (${error.message})`);
            break;
          }
        }
      }
      invented += scoreBuild(built, label, scores, notes);
      done += 1;
      if (done % 5 === 0 || done === sample.length) {
        await db.update(evalRun).set({ done, scores, inventedClaims: invented, failures }).where(eq(evalRun.id, run.id));
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, sample.length) }, async () => {
        while (next < sample.length) await buildOne(next++);
      }),
    );

    latencies.sort((a, b) => a - b);
    const cost = calls.reduce((a, c) => a + costMicros(c.model, c.usage.inputTokens, c.usage.outputTokens), 0);
    await recordCalls(db, calls, { storeId: run.storeId, importId: null });
    await db
      .update(evalRun)
      .set({
        status: "completed",
        done,
        scores,
        inventedClaims: invented,
        failures,
        notes,
        costMicros: cost,
        inputTokens: calls.reduce((a, c) => a + c.usage.inputTokens, 0),
        outputTokens: calls.reduce((a, c) => a + c.usage.outputTokens, 0),
        p50Ms: latencies[Math.floor(latencies.length / 2)] ?? 0,
        finishedAt: new Date(),
      })
      .where(eq(evalRun.id, run.id));
    return { done, invented, failures };
  } catch (error) {
    await db.update(evalRun).set({ status: "failed", error: (error as Error).message, finishedAt: new Date() }).where(eq(evalRun.id, run.id));
    return { failed: (error as Error).message };
  }
}
