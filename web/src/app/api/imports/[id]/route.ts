import { NextResponse } from "next/server";
import { getApiContext } from "@/lib/auth/session";
import { getImport } from "@/server/imports";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const search = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(search.get("limit")) || 100));
  const offset = Math.max(0, Number(search.get("offset")) || 0);

  const result = await getImport(ctx.store.id, id, { offset, limit });
  if (!result) return NextResponse.json({ error: "Import not found" }, { status: 404 });
  return NextResponse.json(result);
}
