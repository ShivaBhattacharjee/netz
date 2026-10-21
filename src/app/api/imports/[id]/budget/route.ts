import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { raiseBudget } from "@/server/jobs/budget";

const schema = z.object({ budget_usd: z.number().positive().max(10_000) });

export const POST = withStore<{ id: string }>(
  async (ctx, request, { id }) => {
    const input = await body(request, schema);
    return NextResponse.json(await raiseBudget(ctx.store.id, id, input.budget_usd));
  },
  { sessionOnly: true },
);
