import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

async function check(run: () => Promise<unknown>) {
  try {
    await withTimeout(run(), 3000);
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : "failed";
  }
}

export async function GET() {
  const [database, queue] = await Promise.all([
    check(() => db.execute(sql`select 1`)),
    check(() => redis().ping()),
  ]);
  const healthy = database === "ok" && queue === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", database, redis: queue },
    { status: healthy ? 200 : 503 },
  );
}
