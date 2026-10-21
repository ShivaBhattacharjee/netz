import { NextResponse } from "next/server";
import { z } from "zod";
import { createEvalRun, evalOptions, listEvalRuns } from "@/server/evals/service";
import { body, withStore } from "@/server/http";

const schema = z.object({
  set: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  limit: z.number().int().min(1).max(10_000),
});

export const GET = withStore(async (ctx) => NextResponse.json({ ...(await evalOptions(ctx.store.id)), runs: await listEvalRuns(ctx.store.id) }), { sessionOnly: true });

export const POST = withStore(async (ctx, request) => NextResponse.json({ id: await createEvalRun(ctx.store.id, await body(request, schema)) }, { status: 202 }), {
  sessionOnly: true,
});
