import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { getImportRow } from "@/server/imports";

export const GET = withStore<{ id: string; row: string }>(async (ctx, _request, { id, row }) => {
  const result = await getImportRow(ctx.store.id, id, Number(row));
  if (!result) return NextResponse.json({ error: "Row not found" }, { status: 404 });
  return NextResponse.json(result);
});
