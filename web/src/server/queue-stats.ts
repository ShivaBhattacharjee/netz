import type { QueueStats } from "@/lib/types";
import { currentPause } from "./jobs/gate";
import { QUEUE, queue } from "./queues";

export async function queueStats(): Promise<QueueStats> {
  const names = Object.values(QUEUE);
  const queues = await Promise.all(
    names.map(async (name) => {
      const q = queue(name);
      const [counts, workers] = await Promise.all([
        q.getJobCounts("waiting", "prioritized", "active", "delayed", "completed", "failed"),
        q.getWorkers(),
      ]);
      return {
        name,
        waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        workers: workers.length,
      };
    }),
  );
  const pause = await currentPause();
  return { queues, pause: pause ? { until: new Date(pause.until).toISOString(), reason: pause.reason } : null };
}
