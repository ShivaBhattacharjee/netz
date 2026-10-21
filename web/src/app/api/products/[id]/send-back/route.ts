import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { sendBack } from "@/server/products";

const schema = z.object({ note: z.string().trim().max(1000).default("") });

export const POST = withStore<{ id: string }>(async (ctx, request, { id }) => {
  const { note } = await body(request, schema);
  await sendBack(ctx.store.id, id, note);
  return NextResponse.json({ ok: true });
});
