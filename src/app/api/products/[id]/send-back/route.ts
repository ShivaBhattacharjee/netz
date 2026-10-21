import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { sendBack } from "@/server/products";
import { invalidateStorefront } from "@/server/storefront";

const schema = z.object({ note: z.string().trim().max(1000).default("") });

export const POST = withStore<{ id: string }>(async (ctx, request, { id }) => {
  const { note } = await body(request, schema);
  await sendBack(ctx.store.id, id, note);
  invalidateStorefront(ctx.store.id);
  return NextResponse.json({ ok: true });
});
