import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { cancelImport } from "@/server/imports";

export const POST = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  await cancelImport(ctx.store.id, id);
  return NextResponse.json({ ok: true });
});
