import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { evalRun, type FieldScores } from "@/db/schema";
import { type AiCallRecord, type BuiltProduct, finalizeBuild, generateBuild } from "../ai/build";
import { classify } from "../ai/anthropic";
import { mockBuild } from "../ai/mock";
import { costMicros } from "../ai/pricing";
import { env } from "../env";
import { scoreBuild, scoreCleaning } from "../evals/score";
import { resolvePrompt } from "../evals/prompts";
import { loadEvalSet } from "../evals/sets";
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
  if (!run || run.status === "completed" || run.status === "failed") return { skipped: true };
  const live = and(eq(evalRun.id, run.id), inArray(evalRun.status, ["queued", "running"]));

  try {
    const config = env();
    if (!run.setId) throw new Error("The eval set was deleted");
    const { groups, labels } = await loadEvalSet(run.storeId, run.setId);
    const prompt = await resolvePrompt(run.storeId, run.prompt);

    const scores: FieldScores = {};
    const notes: string[] = [];
    scoreCleaning(groups, labels, scores, notes);

    const byKey = new Map(groups.map((g) => [g.group_key, g]));
    const sample = labels.products.filter((l) => byKey.has(l.group)).slice(0, run.sampleLimit);
    const started = await db.update(evalRun).set({ status: "running", total: sample.length, done: 0, scores }).where(live).returning({ id: evalRun.id });
    if (!started.length) return { stopped: true };

    let invented = 0;
    let failures = 0;
    let done = 0;
    const latencies: number[] = [];
    const calls: AiCallRecord[] = [];
    let next = 0;
    let stopped = false;

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
            const result = await generateBuild(group, model, { withPhotos: false, maxOutputTokens: 4096, prompt });
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
        const updated = await db.update(evalRun).set({ done, scores, inventedClaims: invented, failures }).where(live).returning({ id: evalRun.id });
        if (!updated.length) stopped = true;
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(PARALLEL, sample.length) }, async () => {
        while (!stopped && next < sample.length) await buildOne(next++);
      }),
    );

    latencies.sort((a, b) => a - b);
    const cost = calls.reduce((a, c) => a + costMicros(c.model, c.usage), 0);
    await recordCalls(db, calls, { storeId: run.storeId, importId: null });
    if (stopped) return { stopped: true, done };
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
      .where(live);
    return { done, invented, failures };
  } catch (error) {
    await db.update(evalRun).set({ status: "failed", error: (error as Error).message, finishedAt: new Date() }).where(live);
    return { failed: (error as Error).message };
  }
}
