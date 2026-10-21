import { NextResponse } from "next/server";
import { CUSTOM_PREFIX, deleteCustomPrompt, resolvePrompt } from "@/server/evals/prompts";
import { withStore } from "@/server/http";

export const GET = withStore<{ name: string }>(
  async (ctx, _request, { name }) => {
    const key = decodeURIComponent(name);
    const prompt = await resolvePrompt(ctx.store.id, key);
    const source = key.startsWith(CUSTOM_PREFIX) ? "Saved in this store" : `web/prompts/${key}.md`;
    return NextResponse.json({ name: prompt.name, source, version: prompt.version, system: prompt.system, user: prompt.user, custom: key.startsWith(CUSTOM_PREFIX) });
  },
  { sessionOnly: true },
);

export const DELETE = withStore<{ name: string }>(
  async (ctx, _request, { name }) => {
    await deleteCustomPrompt(ctx.store.id, decodeURIComponent(name));
    return new NextResponse(null, { status: 204 });
  },
  { sessionOnly: true },
);
