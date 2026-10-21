import { NextResponse } from "next/server";
import { createEvalSet, createEvalSetSchema, listEvalSets } from "@/server/evals/sets";
import { body, withStore } from "@/server/http";

export const GET = withStore(async (ctx) => NextResponse.json({ sets: await listEvalSets(ctx.store.id) }), { sessionOnly: true });

export const POST = withStore(async (ctx, request) => NextResponse.json(await createEvalSet(ctx.store.id, ctx.userId, await body(request, createEvalSetSchema)), { status: 201 }), {
  sessionOnly: true,
});
