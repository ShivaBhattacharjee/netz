import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { invalidateStorefront } from "@/server/storefront";
import { approveProducts } from "@/server/products";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(10_000) });

export const POST = withStore(async (ctx, request) => {
  const { ids } = await body(request, schema);
  const approved = await approveProducts(ctx.store.id, ids);
  invalidateStorefront(ctx.store.id);
  return NextResponse.json({ approved });
});
