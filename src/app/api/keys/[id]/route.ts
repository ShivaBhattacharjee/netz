import { NextResponse } from "next/server";
import { revokeApiKey } from "@/server/api-keys";
import { withStore } from "@/server/http";

export const DELETE = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await revokeApiKey(ctx.store.id, id);
    return new NextResponse(null, { status: 204 });
  },
  { sessionOnly: true },
);
