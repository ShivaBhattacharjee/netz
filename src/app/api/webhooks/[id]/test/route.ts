import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { testWebhook } from "@/server/webhooks";

export const POST = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await testWebhook(ctx.store.id, id);
    return NextResponse.json({ queued: true }, { status: 202 });
  },
  { sessionOnly: true },
);
