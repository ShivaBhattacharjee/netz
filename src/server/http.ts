import { NextResponse } from "next/server";
import { z } from "zod";
import { type ApiContext, getApiContext } from "@/lib/auth/session";
import { ApiKeyInputError } from "./api-keys";
import { EvalSetError } from "./evals/sets";
import { ImportInputError } from "./imports";
import { ProductInputError } from "./products";
import { WebhookInputError } from "./webhooks";

export function withStore<P>(handler: (ctx: ApiContext, request: Request, params: P) => Promise<Response>, opts: { sessionOnly?: boolean } = {}) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    const ctx = await getApiContext();
    if (!ctx) return NextResponse.json({ error: "Not signed in or invalid API key" }, { status: 401 });
    if (opts.sessionOnly && ctx.via !== "session") return NextResponse.json({ error: "This endpoint needs a signed-in user" }, { status: 403 });
    try {
      return await handler(ctx, request, await params);
    } catch (error) {
      if (error instanceof ImportInputError || error instanceof ProductInputError || error instanceof WebhookInputError || error instanceof ApiKeyInputError || error instanceof EvalSetError) {
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
