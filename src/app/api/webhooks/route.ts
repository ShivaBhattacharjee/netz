import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { WEBHOOK_EVENTS, createWebhook, listWebhooks } from "@/server/webhooks";

const schema = z.object({ url: z.string().trim().min(1).max(2000), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) });

export const GET = withStore(async (ctx) => NextResponse.json(await listWebhooks(ctx.store.id)), { sessionOnly: true });

export const POST = withStore(
  async (ctx, request) => NextResponse.json(await createWebhook(ctx.store.id, await body(request, schema)), { status: 201 }),
  { sessionOnly: true },
);
