import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { importJob } from "@/db/schema";
import type { AiError } from "../ai/gemini";
import { log } from "../log";
import { redis } from "../redis";

const PAUSE_KEY = "ai:pause";
const FAILURE_KEY = "ai:failures";
const BREAKER_THRESHOLD = 10;
const BREAKER_PAUSE_MS = 30_000;

export interface Pause {
  until: number;
  reason: string;
}

export async function currentPause(): Promise<Pause | null> {
  const raw = await redis().get(PAUSE_KEY);
  if (!raw) return null;
  const pause = JSON.parse(raw) as Pause;
  return pause.until > Date.now() ? pause : null;
}

export async function pauseAi(ms: number, reason: string) {
  const until = Date.now() + ms;
  const existing = await currentPause();
  if (!existing || existing.until < until) {
    await redis().set(PAUSE_KEY, JSON.stringify({ until, reason } satisfies Pause), "PX", ms);
  }
  const result = await db
    .update(importJob)
    .set({ status: "paused", pausedUntil: new Date(Math.max(until, existing?.until ?? 0)) })
    .where(inArray(importJob.status, ["processing", "paused"]))
    .returning({ id: importJob.id });
  log.warn("AI paused", { ms, reason, imports: result.length });
}

export function pauseFor(error: AiError): { ms: number; reason: string } | null {
  switch (error.kind) {
    case "rate_limit":
      return { ms: error.retryAfterMs ?? 60_000, reason: "AI rate limit reached" };
    case "quota_daily":
      return { ms: error.retryAfterMs ?? 60 * 60_000, reason: "Daily AI quota reached" };
    case "auth":
      return { ms: 5 * 60_000, reason: error.message };
    default:
      return null;
  }
}

export async function recordProviderFailure(): Promise<{ ms: number; reason: string } | null> {
  const n = await redis().incr(FAILURE_KEY);
  if (n === 1) await redis().pexpire(FAILURE_KEY, 60_000);
  return n >= BREAKER_THRESHOLD ? { ms: BREAKER_PAUSE_MS, reason: "AI provider is failing, pausing before retrying" } : null;
}

export async function recordProviderSuccess(importId: string | null) {
  await redis().del(FAILURE_KEY);
  if (!importId) return;
  await db
    .update(importJob)
    .set({ status: "processing", pausedUntil: null })
    .where(and(eq(importJob.id, importId), eq(importJob.status, "paused")));
}
