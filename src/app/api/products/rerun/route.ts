import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { product } from "@/db/schema";
import { RERUN_MODELS } from "@/lib/models";
import { body, withStore } from "@/server/http";
import { enqueueRerun } from "@/server/queues";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000),
  model: z.enum(RERUN_MODELS.map((m) => m.id) as [string, ...string[]]),
  fields: z.array(z.enum(["title", "description_html", "category", "attributes", "claims", "seo"])).min(1),
  note: z.string().trim().max(1000).default(""),
});

export const POST = withStore(async (ctx, request) => {
  const input = await body(request, schema);
  const rows = await db
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.storeId, ctx.store.id), isNull(product.deletedAt), ne(product.status, "approved"), inArray(product.id, input.ids)));
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to re-run: approved products are skipped" }, { status: 400 });
  const strong = RERUN_MODELS.find((m) => m.id === input.model)?.tier === "strong";
  await enqueueRerun(rows.map((r) => ({ productId: r.id, model: input.model, fields: input.fields, note: input.note })), strong);
  return NextResponse.json({ queued: rows.length }, { status: 202 });
});
