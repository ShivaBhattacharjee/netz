import { NextResponse } from "next/server";
import { z } from "zod";
import { createExperiment, evalOptions, listExperiments } from "@/server/evals/service";
import { body, withStore } from "@/server/http";

const variant = z.object({ model: z.string().min(1), prompt: z.string().min(1) });
const schema = z.object({
  name: z.string().trim().min(1, "Name the experiment").max(80),
  set: z.string().min(1),
  limit: z.number().int().min(1).max(10_000),
  a: variant,
  b: variant,
});

export const GET = withStore(async (ctx) => NextResponse.json({ ...(await evalOptions(ctx.store.id)), experiments: await listExperiments(ctx.store.id) }), { sessionOnly: true });

export const POST = withStore(async (ctx, request) => NextResponse.json({ id: await createExperiment(ctx.store.id, await body(request, schema)) }, { status: 202 }), {
  sessionOnly: true,
});
