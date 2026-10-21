import { deleteEvalSet } from "@/server/evals/sets";
import { withStore } from "@/server/http";

export const DELETE = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await deleteEvalSet(ctx.store.id, id);
    return new Response(null, { status: 204 });
  },
  { sessionOnly: true },
);
