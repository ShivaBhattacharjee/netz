import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { WEBHOOK_EVENTS, deleteWebhook, updateWebhook } from "@/server/webhooks";

const schema = z.object({ enabled: z.boolean().optional(), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional() });

export const PATCH = withStore<{ id: string }>(
  async (ctx, request, { id }) => {
    await updateWebhook(ctx.store.id, id, await body(request, schema));
    return NextResponse.json({ ok: true });
  },
  { sessionOnly: true },
);

export const DELETE = withStore<{ id: string }>(
  async (ctx, _request, { id }) => {
    await deleteWebhook(ctx.store.id, id);
    return new NextResponse(null, { status: 204 });
  },
  { sessionOnly: true },
);
