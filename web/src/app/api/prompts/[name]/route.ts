import { NextResponse } from "next/server";
import { buildPromptVariants, loadPrompt } from "@/server/ai/prompts";
import { withStore } from "@/server/http";

export const GET = withStore<{ name: string }>(
  async (_ctx, _request, { name }) => {
    if (!buildPromptVariants().some((p) => p.name === name)) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    const prompt = loadPrompt(name);
    return NextResponse.json({ name, file: `prompts/${name}.md`, version: prompt.version, system: prompt.system, user: prompt.user });
  },
  { sessionOnly: true },
);
