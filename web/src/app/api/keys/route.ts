import { NextResponse } from "next/server";
import { z } from "zod";
import { createApiKey, listApiKeys } from "@/server/api-keys";
import { body, withStore } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1, "Give the key a name").max(60) });

export const GET = withStore(async (ctx) => NextResponse.json({ keys: await listApiKeys(ctx.store.id) }), { sessionOnly: true });

export const POST = withStore(
  async (ctx, request) => {
    const { name } = await body(request, schema);
    return NextResponse.json(await createApiKey(ctx.store.id, ctx.userId, name), { status: 201 });
  },
  { sessionOnly: true },
);
