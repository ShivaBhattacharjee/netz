import { NextResponse } from "next/server";
import { stopEvalRun } from "@/server/evals/service";
import { withStore } from "@/server/http";

export const POST = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await stopEvalRun(ctx.store.id, id);
    return NextResponse.json({ ok: true });
  },
  { sessionOnly: true },
);
