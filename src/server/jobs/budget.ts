import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { importGroup, importJob } from "@/db/schema";
import { costMicros } from "../ai/pricing";
import { loadPrompt } from "../ai/prompts";
import { env } from "../env";
import { log } from "../log";
import type { GroupInput } from "../pipeline/group";
import { enqueueBuilds } from "../queues";
import { publish } from "./progress";

const CHARS_PER_TOKEN = 4;
const TOKENS_PER_PHOTO = 800;
const PHOTOS_PER_CALL = 3;
const BUILD_OUTPUT_TOKENS = 1_500;
const TRANSLATE_INPUT_TOKENS = 900;
const TRANSLATE_OUTPUT_TOKENS = 700;

export class BudgetError extends Error {}

export function estimateMicros(groups: { input: GroupInput; route: "cheap" | "strong" }[]) {
  const config = env();
  if (config.AI_MODE === "mock") return 0;
  const systemTokens = loadPrompt("build-product").system.length / CHARS_PER_TOKEN;
  let total = 0;
  for (const g of groups) {
    const model = g.route === "strong" ? config.AI_MODEL_STRONG : config.AI_MODEL_FAST;
    const photos = g.route === "strong" ? Math.min(PHOTOS_PER_CALL, g.input.photos.length) : 0;
    const input = Math.ceil(systemTokens + JSON.stringify(g.input).length / CHARS_PER_TOKEN + photos * TOKENS_PER_PHOTO);
    total += costMicros(model, { inputTokens: input, outputTokens: BUILD_OUTPUT_TOKENS });
    total += costMicros(config.AI_MODEL_TRANSLATE, { inputTokens: TRANSLATE_INPUT_TOKENS, outputTokens: 2 * TRANSLATE_OUTPUT_TOKENS });
  }
  return Math.round(total);
}

export function budgetFor(estimate: number) {
  const config = env();
  if (config.AI_MODE === "mock") return null;
  return Math.max(Math.round(estimate * config.AI_BUDGET_MULTIPLIER), Math.round(config.AI_BUDGET_MIN_USD * 1_000_000));
}

/** Returns true when the import has spent its budget; the import is paused until the merchant raises it. */
export async function overBudget(importId: string) {
  const [imp] = await db
    .select({ storeId: importJob.storeId, cost: importJob.costMicros, budget: importJob.budgetMicros, status: importJob.status })
    .from(importJob)
    .where(eq(importJob.id, importId));
  if (!imp || imp.budget === null || imp.cost < imp.budget) return false;
  const reason = `AI budget reached: spent $${(imp.cost / 1e6).toFixed(2)} of $${(imp.budget / 1e6).toFixed(2)}. Raise the budget to continue.`;
  const paused = await db
    .update(importJob)
    .set({ status: "paused", pausedUntil: null, error: reason })
    .where(and(eq(importJob.id, importId), inArray(importJob.status, ["processing", "paused"]), isNotNull(importJob.budgetMicros)))
    .returning({ id: importJob.id });
  if (paused.length && imp.status !== "paused") {
    log.warn("import paused on budget", { importId, costMicros: imp.cost, budgetMicros: imp.budget });
    await publish({ type: "import.progress", importId, storeId: imp.storeId });
  }
  return true;
}

export function isBudgetPaused(job: { status: string; pausedUntil: Date | null; budgetMicros: number | null; costMicros: number }) {
  return job.status === "paused" && job.pausedUntil === null && job.budgetMicros !== null && job.costMicros >= job.budgetMicros;
}

export async function raiseBudget(storeId: string, importId: string, budgetUsd: number) {
  const [imp] = await db.select().from(importJob).where(and(eq(importJob.id, importId), eq(importJob.storeId, storeId)));
  if (!imp) throw new BudgetError("Import not found");
  const budget = Math.round(budgetUsd * 1_000_000);
  if (budget <= imp.costMicros) throw new BudgetError(`The new budget must be above what the import already spent ($${(imp.costMicros / 1e6).toFixed(2)})`);
  const wasPaused = isBudgetPaused(imp);
  await db
    .update(importJob)
    .set({ budgetMicros: budget, ...(wasPaused ? { status: "processing" as const, error: null } : {}) })
    .where(eq(importJob.id, importId));
  if (wasPaused) {
    const pending = await db
      .select({ id: importGroup.id, route: importGroup.route })
      .from(importGroup)
      .where(and(eq(importGroup.importId, importId), eq(importGroup.status, "pending")));
    if (pending.length) await enqueueBuilds(importId, pending, `b${Date.now().toString(36)}`);
  }
  return { budget_micros: budget, resumed: wasPaused };
}
