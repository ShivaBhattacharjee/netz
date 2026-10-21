import { type JobsOptions, Queue } from "bullmq";
import { createRedis } from "./redis";

export const QUEUE = {
  parse: "parse",
  aiCheap: "ai.cheap",
  aiStrong: "ai.strong",
  translate: "translate",
  webhooks: "webhooks",
  eval: "eval",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export interface ParseJob {
  importId: string;
}

export interface BuildJob {
  importId: string;
  groupId: string;
}

export interface RerunJob {
  productId: string;
  model: string;
  fields: string[];
  note: string;
}

export interface TranslateJob {
  productId: string;
  locale: "de" | "fr";
}

export const BACKOFF_STRATEGY = "jittered";

export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: BACKOFF_STRATEGY, delay: 2_000 },
  removeOnComplete: { age: 24 * 3600, count: 50_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function jitteredBackoff(attemptsMade: number) {
  const base = 2_000 * 2 ** Math.max(0, attemptsMade - 1);
  return Math.min(5 * 60_000, Math.round(base / 2 + Math.random() * base));
}

const globalForQueues = globalThis as unknown as { queues?: Map<QueueName, Queue> };

export function queue(name: QueueName) {
  globalForQueues.queues ??= new Map();
  let q = globalForQueues.queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: createRedis(), defaultJobOptions });
    globalForQueues.queues.set(name, q);
  }
  return q;
}

export const jobId = {
  parse: (importId: string, attempt?: string) => `${importId}__parse${attempt ? `__${attempt}` : ""}`,
  build: (importId: string, groupId: string, attempt?: string) => `${importId}__${groupId}__build${attempt ? `__${attempt}` : ""}`,
  translate: (productId: string, locale: string, sourceHash: string) => `${productId}__${locale}__${sourceHash.slice(0, 16)}`,
};

export function enqueueParse(importId: string, attempt?: string) {
  return queue(QUEUE.parse).add("parse", { importId } satisfies ParseJob, { jobId: jobId.parse(importId, attempt), attempts: 3 });
}

export function enqueueBuilds(importId: string, groups: { id: string; route: "cheap" | "strong" }[], attempt?: string) {
  const byQueue = new Map<QueueName, { name: string; data: BuildJob; opts: JobsOptions }[]>();
  for (const g of groups) {
    const name = g.route === "strong" ? QUEUE.aiStrong : QUEUE.aiCheap;
    const list = byQueue.get(name) ?? [];
    list.push({ name: "build", data: { importId, groupId: g.id }, opts: { jobId: jobId.build(importId, g.id, attempt) } });
    byQueue.set(name, list);
  }
  return Promise.all([...byQueue].map(([name, jobs]) => queue(name).addBulk(jobs)));
}

export function enqueueRerun(jobs: RerunJob[], strong: boolean) {
  const stamp = Date.now().toString(36);
  return queue(strong ? QUEUE.aiStrong : QUEUE.aiCheap).addBulk(
    jobs.map((data) => ({ name: "rerun", data, opts: { jobId: `${data.productId}__rerun__${stamp}`, attempts: 3 } })),
  );
}

export function enqueueTranslate(productId: string, locale: TranslateJob["locale"], sourceHash: string) {
  return queue(QUEUE.translate).add("translate", { productId, locale } satisfies TranslateJob, {
    jobId: jobId.translate(productId, locale, sourceHash),
  });
}
