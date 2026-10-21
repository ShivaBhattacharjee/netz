import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { evalRun, evalSet, experiment } from "@/db/schema";
import { RERUN_MODELS } from "@/lib/models";
import { newId } from "../ids";
import { QUEUE, queue } from "../queues";
import { promptOptions, resolvePrompt } from "./prompts";
import { EvalSetError, listEvalSets } from "./sets";

export const EVAL_MODELS = RERUN_MODELS;

export interface VariantInput {
  model: string;
  prompt: string;
}

type RunRow = typeof evalRun.$inferSelect;

function toRun(r: RunRow, withNotes = false) {
  return {
    id: r.id,
    experiment_id: r.experimentId,
    label: r.label,
    set: r.set,
    model: r.model,
    prompt: r.prompt,
    prompt_version: r.promptVersion,
    sample_limit: r.sampleLimit,
    status: r.status,
    total: r.total,
    done: r.done,
    scores: r.scores,
    invented_claims: r.inventedClaims,
    failures: r.failures,
    cost_micros: r.costMicros,
    input_tokens: r.inputTokens,
    output_tokens: r.outputTokens,
    p50_ms: r.p50Ms,
    error: r.error,
    created_at: r.createdAt.toISOString(),
    finished_at: r.finishedAt?.toISOString() ?? null,
    ...(withNotes ? { notes: r.notes } : {}),
  };
}

export type EvalRunView = ReturnType<typeof toRun>;

export async function evalOptions(storeId: string) {
  return { sets: await listEvalSets(storeId), prompts: await promptOptions(storeId), models: EVAL_MODELS };
}

type SetRow = { id: string; name: string };

async function findSet(storeId: string, setId: string): Promise<SetRow> {
  const [row] = await db.select({ id: evalSet.id, name: evalSet.name }).from(evalSet).where(and(eq(evalSet.id, setId), eq(evalSet.storeId, storeId)));
  if (!row) throw new EvalSetError("Eval set not found");
  return row;
}

async function validate(storeId: string, variant: VariantInput) {
  if (!EVAL_MODELS.some((m) => m.id === variant.model)) throw new EvalSetError(`Unknown model "${variant.model}"`);
  return resolvePrompt(storeId, variant.prompt);
}

async function createRun(storeId: string, set: SetRow, limit: number, variant: VariantInput, label: string, experimentId: string | null) {
  const prompt = await validate(storeId, variant);
  const id = newId("eval");
  await db.insert(evalRun).values({
    id,
    storeId,
    experimentId,
    label,
    set: set.name,
    setId: set.id,
    model: variant.model,
    prompt: variant.prompt,
    promptVersion: prompt.version,
    sampleLimit: limit,
  });
  await queue(QUEUE.eval).add("eval", { runId: id }, { jobId: id, attempts: 1 });
  return id;
}

export async function listEvalRuns(storeId: string) {
  const rows = await db.select().from(evalRun).where(and(eq(evalRun.storeId, storeId), isNull(evalRun.experimentId))).orderBy(desc(evalRun.createdAt)).limit(50);
  return rows.map((r) => toRun(r));
}

export async function createEvalRun(storeId: string, input: { set: string; limit: number } & VariantInput) {
  const prompt = await resolvePrompt(storeId, input.prompt);
  const label = `${prompt.name} · ${EVAL_MODELS.find((m) => m.id === input.model)?.label ?? input.model}`;
  return createRun(storeId, await findSet(storeId, input.set), input.limit, input, label, null);
}

export async function getEvalRun(storeId: string, id: string) {
  const [row] = await db.select().from(evalRun).where(and(eq(evalRun.id, id), eq(evalRun.storeId, storeId)));
  return row ? toRun(row, true) : null;
}

const STOPPED = "Stopped";

async function ownedRun(storeId: string, id: string) {
  const [row] = await db.select().from(evalRun).where(and(eq(evalRun.id, id), eq(evalRun.storeId, storeId)));
  if (!row) throw new EvalSetError("Evaluation not found");
  return row;
}

export async function stopEvalRun(storeId: string, id: string) {
  const run = await ownedRun(storeId, id);
  if (run.status !== "queued" && run.status !== "running") throw new EvalSetError("Only queued or running evaluations can be stopped");
  await db.update(evalRun).set({ status: "failed", error: STOPPED, finishedAt: new Date() }).where(eq(evalRun.id, id));
  const jobs = await queue(QUEUE.eval).getJobs(["waiting", "delayed", "prioritized"]);
  await Promise.all(jobs.filter((j) => j.data?.runId === id).map((j) => j.remove().catch(() => undefined)));
}

export async function retryEvalRun(storeId: string, id: string) {
  const run = await ownedRun(storeId, id);
  if (run.status !== "failed") throw new EvalSetError("Only failed or stopped evaluations can be retried");
  await db
    .update(evalRun)
    .set({ status: "queued", total: 0, done: 0, scores: {}, inventedClaims: 0, failures: 0, costMicros: 0, inputTokens: 0, outputTokens: 0, p50Ms: 0, notes: [], error: null, finishedAt: null })
    .where(eq(evalRun.id, id));
  await queue(QUEUE.eval).add("eval", { runId: id }, { jobId: `${id}__${Date.now().toString(36)}`, attempts: 1 });
}

export async function deleteEvalRun(storeId: string, id: string) {
  const run = await ownedRun(storeId, id);
  if (run.experimentId) throw new EvalSetError("Delete the experiment to remove its runs");
  if (run.status === "queued" || run.status === "running") await stopEvalRun(storeId, id);
  await db.delete(evalRun).where(and(eq(evalRun.id, id), eq(evalRun.storeId, storeId)));
}

export async function listExperiments(storeId: string) {
  const experiments = await db.select().from(experiment).where(eq(experiment.storeId, storeId)).orderBy(desc(experiment.createdAt)).limit(30);
  const runs = experiments.length
    ? await db.select().from(evalRun).where(inArray(evalRun.experimentId, experiments.map((e) => e.id)))
    : [];
  return experiments.map((e) => ({
    id: e.id,
    name: e.name,
    set: e.set,
    created_at: e.createdAt.toISOString(),
    variants: runs
      .filter((r) => r.experimentId === e.id)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((r) => toRun(r, true)),
  }));
}

export async function deleteExperiment(storeId: string, id: string) {
  const [record] = await db.select({ id: experiment.id }).from(experiment).where(and(eq(experiment.id, id), eq(experiment.storeId, storeId)));
  if (!record) throw new EvalSetError("Experiment not found");
  const runs = await db.select({ id: evalRun.id, status: evalRun.status }).from(evalRun).where(eq(evalRun.experimentId, id));
  await Promise.all(runs.filter((run) => run.status === "queued" || run.status === "running").map((run) => stopEvalRun(storeId, run.id)));
  await db.delete(experiment).where(and(eq(experiment.id, id), eq(experiment.storeId, storeId)));
}

export async function createExperiment(storeId: string, input: { name: string; set: string; limit: number; a: VariantInput; b: VariantInput }) {
  const set = await findSet(storeId, input.set);
  await validate(storeId, input.a);
  await validate(storeId, input.b);
  if (input.a.model === input.b.model && input.a.prompt === input.b.prompt) throw new EvalSetError("Variants A and B are identical");
  const id = newId("exp");
  await db.insert(experiment).values({ id, storeId, name: input.name, set: set.name, setId: set.id });
  await createRun(storeId, set, input.limit, input.a, "A", id);
  await createRun(storeId, set, input.limit, input.b, "B", id);
  return id;
}
