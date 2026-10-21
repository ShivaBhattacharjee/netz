import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { retryImport } from "@/server/imports";

const schema = z.object({ group_key: z.string().min(1).optional() }).optional();

export const POST = withStore<{ id: string }>(async (ctx, request, { id }) => {
  const input = await body(request, schema);
  return NextResponse.json(await retryImport(ctx.store.id, id, input?.group_key));
});
