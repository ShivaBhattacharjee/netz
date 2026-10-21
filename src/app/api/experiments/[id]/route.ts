import { NextResponse } from "next/server";
import { deleteExperiment } from "@/server/evals/service";
import { withStore } from "@/server/http";

export const DELETE = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  await deleteExperiment(ctx.store.id, id);
  return new NextResponse(null, { status: 204 });
}, { sessionOnly: true });

