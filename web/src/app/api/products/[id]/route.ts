import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { editProduct, getProduct } from "@/server/products";

const editSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), field: z.enum(["title", "description_html", "category"]), value: z.string().trim().min(1).max(10_000) }),
  z.object({ kind: z.literal("translation"), locale: z.enum(["de", "fr"]), field: z.enum(["title", "description_html"]), text: z.string().trim().min(1).max(10_000) }),
  z.object({ kind: z.literal("seo"), locale: z.enum(["en", "de", "fr"]), field: z.enum(["meta_title", "meta_description"]), value: z.string().trim().max(300) }),
]);

export const GET = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  const result = await getProduct(ctx.store.id, id);
  if (!result) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json({ product: result });
});

export const PATCH = withStore<{ id: string }>(async (ctx, request, { id }) => {
  await editProduct(ctx.store.id, id, await body(request, editSchema));
  return NextResponse.json({ product: await getProduct(ctx.store.id, id) });
});
