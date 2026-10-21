import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomPrompt } from "@/server/evals/prompts";
import { body, withStore } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1, "Name the prompt").max(60),
  system: z.string().trim().min(20, "The system prompt is too short").max(20_000),
  user: z.string().trim().min(1).max(5_000),
});

export const POST = withStore(async (ctx, request) => NextResponse.json(await createCustomPrompt(ctx.store.id, ctx.userId, await body(request, schema)), { status: 201 }), {
  sessionOnly: true,
});
