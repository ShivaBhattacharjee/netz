import { NextResponse } from "next/server";
import { getApiContext } from "@/lib/auth/session";
import { ImportInputError, createImport, createImportSchema, listImports } from "@/server/imports";

export async function GET() {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ imports: await listImports(ctx.store.id) });
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = createImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }

  try {
    const created = await createImport(ctx.store.id, ctx.userId, parsed.data);
    return NextResponse.json({ import: created }, { status: 202 });
  } catch (error) {
    if (error instanceof ImportInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
