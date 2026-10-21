import { NextResponse } from "next/server";
import { retryEvalRun } from "@/server/evals/service";
import { withStore } from "@/server/http";

export const POST = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await retryEvalRun(ctx.store.id, id);
    return NextResponse.json({ ok: true });
  },
  { sessionOnly: true },
);
