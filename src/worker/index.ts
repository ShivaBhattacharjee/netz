import "./env";
import { type Job, type Processor, Worker } from "bullmq";
import { db } from "@/db";
import { env } from "@/server/env";
import { runBuild, runRerun } from "@/server/jobs/build";
import { runEval } from "@/server/jobs/eval";
import { runParse } from "@/server/jobs/parse";
import { reconcile } from "@/server/jobs/reconcile";
import { runTranslate } from "@/server/jobs/translate";
import { log } from "@/server/log";
import { deliver } from "@/server/webhooks";
import { BACKOFF_STRATEGY, QUEUE, type QueueName, jitteredBackoff } from "@/server/queues";
import { createRedis, redis } from "@/server/redis";

const config = env();

const CONCURRENCY: Record<QueueName, number> = {
  [QUEUE.parse]: Number(process.env.PARSE_CONCURRENCY ?? 2),
  [QUEUE.aiCheap]: Number(process.env.AI_CHEAP_CONCURRENCY ?? 16),
  [QUEUE.aiStrong]: Number(process.env.AI_STRONG_CONCURRENCY ?? 6),
  [QUEUE.translate]: Number(process.env.TRANSLATE_CONCURRENCY ?? 8),
  [QUEUE.webhooks]: Number(process.env.WEBHOOK_CONCURRENCY ?? 4),
  [QUEUE.eval]: 1,
};

const HANDLERS: Record<QueueName, (job: Job, worker: Worker) => Promise<unknown>> = {
  [QUEUE.parse]: (job) => runParse(job),
  [QUEUE.aiCheap]: (job, worker) => (job.name === "rerun" ? runRerun(job, worker) : runBuild(job, worker)),
  [QUEUE.aiStrong]: (job, worker) => (job.name === "rerun" ? runRerun(job, worker) : runBuild(job, worker)),
  [QUEUE.translate]: runTranslate,
  [QUEUE.webhooks]: (job) => deliver(job.data, job.attemptsMade + 1),
  [QUEUE.eval]: (job) => runEval(job),
};

const selected = (process.env.WORKER_QUEUES?.split(",").map((q) => q.trim()).filter(Boolean) ?? Object.values(QUEUE)) as QueueName[];
const unknown = selected.filter((q) => !(q in HANDLERS));
if (unknown.length) throw new Error(`Unknown queue(s) in WORKER_QUEUES: ${unknown.join(", ")}`);

const isAiQueue = (name: QueueName) => name === QUEUE.aiCheap || name === QUEUE.aiStrong || name === QUEUE.translate;

const workers = selected.map((name) => {
  const processor: Processor = (job) => HANDLERS[name](job, worker);
  const worker: Worker = new Worker(name, processor, {
    connection: createRedis(),
    concurrency: CONCURRENCY[name],
    lockDuration: 30_000,
    stalledInterval: 15_000,
    maxStalledCount: 2,
    settings: { backoffStrategy: (attemptsMade: number, type?: string) => (type === BACKOFF_STRATEGY ? jitteredBackoff(attemptsMade) : 0) },
    ...(config.AI_RPM && isAiQueue(name) ? { limiter: { max: config.AI_RPM, duration: 60_000 } } : {}),
  });
  worker.on("failed", (job, error) => {
    if (error?.name === "RateLimitError") return;
    log.warn("job failed", { queue: name, jobId: job?.id, attempt: job?.attemptsMade, error: error.message });
  });
  worker.on("error", (error) => log.error("worker error", { queue: name, error: error.message }));
  return worker;
});

log.info("worker started", { queues: selected, aiMode: config.AI_MODE, models: { fast: config.AI_MODEL_FAST, strong: config.AI_MODEL_STRONG, translate: config.AI_MODEL_TRANSLATE } });

const runReconcile = () => reconcile().catch((error) => log.error("reconcile failed", { error: (error as Error).message }));
void runReconcile();
const timer = setInterval(runReconcile, 5 * 60_000);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("worker stopping", { signal });
  clearInterval(timer);
  const force = setTimeout(() => {
    log.warn("worker forced exit, active jobs will be picked up as stalled");
    process.exit(1);
  }, 30_000);
  await Promise.allSettled(workers.map((w) => w.close()));
  await redis().quit().catch(() => undefined);
  await db.$client.end().catch(() => undefined);
  clearTimeout(force);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
