import { NextResponse } from "next/server";
import { deleteImport, getImport } from "@/server/imports";
import { withStore } from "@/server/http";

const STATUSES = new Set(["pending", "done", "needs_review", "failed"]);

export const GET = withStore<{ id: string }>(async (ctx, request, { id }) => {
  const search = new URL(request.url).searchParams;
  const limit = Math.min(10_000, Math.max(1, Number(search.get("limit")) || 10_000));
  const offset = Math.max(0, Number(search.get("offset")) || 0);
  const status = search.get("status");
  const result = await getImport(ctx.store.id, id, {
    offset,
    limit,
    status: status && STATUSES.has(status) ? (status as "pending" | "done" | "needs_review" | "failed") : undefined,
  });
  if (!result) return NextResponse.json({ error: "Import not found" }, { status: 404 });
  return NextResponse.json(result);
});

export const DELETE = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  await deleteImport(ctx.store.id, id);
  return new NextResponse(null, { status: 204 });
});
