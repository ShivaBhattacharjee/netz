import { NextResponse } from "next/server";
import { z } from "zod";
import { body, withStore } from "@/server/http";
import { resolvePhotoSuggestion } from "@/server/imports";
import { invalidateStorefront } from "@/server/storefront";

const schema = z.object({ accept: z.boolean() });

export const POST = withStore<{ id: string; photoId: string }>(
  async (ctx, request, { id, photoId }) => {
    const input = await body(request, schema);
    const result = await resolvePhotoSuggestion(ctx.store.id, id, photoId, input.accept);
    if (result.productId) invalidateStorefront(ctx.store.id);
    return NextResponse.json(result);
  },
  { sessionOnly: true },
);
