import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/auth/session";
import { ImportInputError } from "./imports";
import { ProductInputError } from "./products";

type Ctx = NonNullable<Awaited<ReturnType<typeof getApiContext>>>;

export function withStore<P>(handler: (ctx: Ctx, request: Request, params: P) => Promise<Response>) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    const ctx = await getApiContext();
    if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    try {
      return await handler(ctx, request, await params);
    } catch (error) {
      if (error instanceof ImportInputError || error instanceof ProductInputError) {
        return NextResponse.json({ error: error.message }, { status: error.message.endsWith("not found") ? 404 : 400 });
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      throw error;
    }
  };
}

export async function body<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = undefined;
  }
  return schema.parse(raw);
}
