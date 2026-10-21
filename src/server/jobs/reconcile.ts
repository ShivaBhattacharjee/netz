import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { importGroup, importJob } from "@/db/schema";
import { log } from "../log";
import { enqueueParse } from "../queues";
import { redis } from "../redis";
import { currentPause } from "./gate";
import { enqueuePendingGroups } from "./parse";
import { refreshCounts } from "./progress";

const LOCK_KEY = "reconcile:lock";

export async function reconcile() {
  const locked = await redis().set(LOCK_KEY, String(process.pid), "PX", 60_000, "NX");
  if (!locked) return;
  try {
    const open = await db
      .select({ id: importJob.id, status: importJob.status, pausedUntil: importJob.pausedUntil })
      .from(importJob)
      .where(inArray(importJob.status, ["queued", "processing", "paused"]));

    let parses = 0;
    let groups = 0;
    for (const imp of open) {
      const [hasGroups] = await db.select({ id: importGroup.id }).from(importGroup).where(eq(importGroup.importId, imp.id)).limit(1);
      if (imp.status === "queued" || !hasGroups) {
        await enqueueParse(imp.id);
        parses++;
        continue;
      }
      groups += await enqueuePendingGroups(imp.id);
      await refreshCounts(imp.id);
    }

    if (!(await currentPause())) {
      await db
        .update(importJob)
        .set({ status: "processing", pausedUntil: null })
        .where(and(eq(importJob.status, "paused"), lt(importJob.pausedUntil, new Date())));
    }
    if (open.length) log.info("reconciled", { imports: open.length, parses, groups });
  } finally {
    await redis().del(LOCK_KEY);
  }
}
