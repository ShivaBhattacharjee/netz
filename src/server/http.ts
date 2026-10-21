import { NextResponse } from "next/server";
import { z } from "zod";
import { type ApiContext, getApiContext } from "@/lib/auth/session";
import { ApiKeyInputError } from "./api-keys";
import { EvalSetError } from "./evals/sets";
import { ImportInputError } from "./imports";
import { BudgetError } from "./jobs/budget";
import { ProductInputError } from "./products";
import { type Rule, consume } from "./rate-limit";
import { WebhookInputError } from "./webhooks";

const LIMITS = {
  key: { window: 60, max: 600 },
  store: { window: 60, max: 1200 },
  upload: { window: 3600, max: 5000 },
} satisfies Record<string, Rule>;

/** Applies the per-store and per-API-key request limits; returns a 429 response when one is exceeded. */
export async function limitRequest(ctx: ApiContext, scope: "api" | "upload" = "api"): Promise<Response | null> {
  const checks = [
    scope === "upload" ? consume(`upload:${ctx.store.id}`, LIMITS.upload) : consume(`store:${ctx.store.id}`, LIMITS.store),
    ...(ctx.keyId ? [consume(`key:${ctx.keyId}`, LIMITS.key)] : []),
  ];
  const blocked = (await Promise.all(checks)).find((r) => !r.allowed);
  if (!blocked) return null;
  return NextResponse.json(
    { error: `Too many requests, try again in ${blocked.retryAfter} s` },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfter) } },
  );
}

export function withStore<P>(handler: (ctx: ApiContext, request: Request, params: P) => Promise<Response>, opts: { sessionOnly?: boolean } = {}) {
  return async (request: Request, { params }: { params: Promise<P> }) => {
    const ctx = await getApiContext();
    if (!ctx) return NextResponse.json({ error: "Not signed in or invalid API key" }, { status: 401 });
    if (opts.sessionOnly && ctx.via !== "session") return NextResponse.json({ error: "This endpoint needs a signed-in user" }, { status: 403 });
    const limited = await limitRequest(ctx);
    if (limited) return limited;
    try {
      return await handler(ctx, request, await params);
    } catch (error) {
      if (
        error instanceof ImportInputError ||
        error instanceof ProductInputError ||
        error instanceof WebhookInputError ||
        error instanceof ApiKeyInputError ||
        error instanceof EvalSetError ||
        error instanceof BudgetError
      ) {
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
