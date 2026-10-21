import { NextResponse } from "next/server";
import { deleteEvalRun, getEvalRun } from "@/server/evals/service";
import { withStore } from "@/server/http";

export const GET = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    const run = await getEvalRun(ctx.store.id, id);
    if (!run) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    return NextResponse.json({ run });
  },
  { sessionOnly: true },
);

export const DELETE = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  await deleteEvalRun(ctx.store.id, id);
  return new NextResponse(null, { status: 204 });
}, { sessionOnly: true });
