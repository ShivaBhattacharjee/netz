import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { evalRun, experiment } from "@/db/schema";
import { RERUN_MODELS } from "@/lib/models";
import { buildPromptVariants, loadPrompt } from "../ai/prompts";
import { newId } from "../ids";
import { QUEUE, queue } from "../queues";
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

export function evalOptions() {
  return { sets: listEvalSets(), prompts: buildPromptVariants(), models: EVAL_MODELS };
}

function validate(set: string, variant: VariantInput) {
  if (!listEvalSets().some((s) => s.name === set)) throw new EvalSetError(`Eval set "${set}" is not available`);
  if (!EVAL_MODELS.some((m) => m.id === variant.model)) throw new EvalSetError(`Unknown model "${variant.model}"`);
  if (!buildPromptVariants().some((p) => p.name === variant.prompt)) throw new EvalSetError(`Unknown prompt "${variant.prompt}"`);
}

async function createRun(storeId: string, set: string, limit: number, variant: VariantInput, label: string, experimentId: string | null) {
  validate(set, variant);
  const id = newId("eval");
  await db.insert(evalRun).values({
    id,
    storeId,
    experimentId,
    label,
    set,
    model: variant.model,
    prompt: variant.prompt,
    promptVersion: loadPrompt(variant.prompt).version,
    sampleLimit: limit,
  });
  await queue(QUEUE.eval).add("eval", { runId: id }, { jobId: id, attempts: 1 });
  return id;
}

export async function listEvalRuns(storeId: string) {
  const rows = await db.select().from(evalRun).where(and(eq(evalRun.storeId, storeId), isNull(evalRun.experimentId))).orderBy(desc(evalRun.createdAt)).limit(50);
  return rows.map((r) => toRun(r));
}

export function createEvalRun(storeId: string, input: { set: string; limit: number } & VariantInput) {
  const label = `${input.prompt} · ${EVAL_MODELS.find((m) => m.id === input.model)?.label ?? input.model}`;
  return createRun(storeId, input.set, input.limit, input, label, null);
}

export async function getEvalRun(storeId: string, id: string) {
  const [row] = await db.select().from(evalRun).where(and(eq(evalRun.id, id), eq(evalRun.storeId, storeId)));
  return row ? toRun(row, true) : null;
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

export async function createExperiment(storeId: string, input: { name: string; set: string; limit: number; a: VariantInput; b: VariantInput }) {
  validate(input.set, input.a);
  validate(input.set, input.b);
  if (input.a.model === input.b.model && input.a.prompt === input.b.prompt) throw new EvalSetError("Variants A and B are identical");
  const id = newId("exp");
  await db.insert(experiment).values({ id, storeId, name: input.name, set: input.set });
  await createRun(storeId, input.set, input.limit, input.a, "A", id);
  await createRun(storeId, input.set, input.limit, input.b, "B", id);
  return id;
}
