import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { editProduct, getProduct } from "@/server/products";
import { invalidateStorefront } from "@/server/storefront";

const editSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), field: z.enum(["title", "description_html", "category"]), value: z.string().trim().min(1).max(10_000) }),
  z.object({ kind: z.literal("translation"), locale: z.enum(["de", "fr"]), field: z.enum(["title", "description_html"]), text: z.string().trim().min(1).max(10_000) }),
  z.object({
    kind: z.literal("variant"),
    sku: z.string().min(1),
    price_cents: z.number().int().min(1).max(100_000_000).nullable(),
    currency: z.enum(["EUR", "GBP", "USD", "CHF"]),
    weight_grams: z.number().int().min(1).max(1_000_000).nullable(),
  }),
  z.object({ kind: z.literal("tags"), tags: z.array(z.string().trim().max(40)).max(20) }),
  z.object({ kind: z.literal("photo"), upload_id: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("attribute"), key: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/), value: z.string().max(200) }),
  z.object({ kind: z.literal("seo"), locale: z.enum(["en", "de", "fr"]), field: z.enum(["meta_title", "meta_description"]), value: z.string().trim().max(300) }),
]);

export const GET = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  const result = await getProduct(ctx.store.id, id);
  if (!result) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json({ product: result });
});

export const PATCH = withStore<{ id: string }>(async (ctx, request, { id }) => {
  await editProduct(ctx.store.id, id, await body(request, editSchema));
  invalidateStorefront(ctx.store.id);
  return NextResponse.json({ product: await getProduct(ctx.store.id, id) });
});
