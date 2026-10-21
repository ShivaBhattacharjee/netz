import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { unpublishProducts } from "@/server/products";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(10_000) });

export const POST = withStore(async (ctx, request) => {
  const { ids } = await body(request, schema);
  return NextResponse.json({ unpublished: await unpublishProducts(ctx.store.id, ids) });
});
