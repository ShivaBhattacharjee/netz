import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customPrompt } from "@/db/schema";
import { type Prompt, buildPromptVariants, loadPrompt } from "../ai/prompts";
import { newId } from "../ids";
import { slugify } from "../pipeline/text";
import { EvalSetError } from "./sets";

export const CUSTOM_PREFIX = "custom:";
const MAX_CUSTOM_PROMPTS = 30;

export interface PromptOption {
  name: string;
  label: string;
  version: string;
  custom: boolean;
}

export async function promptOptions(storeId: string): Promise<PromptOption[]> {
  const files = buildPromptVariants().map((p) => ({ name: p.name, label: p.name, version: p.version, custom: false }));
  const rows = await db.select().from(customPrompt).where(eq(customPrompt.storeId, storeId)).orderBy(desc(customPrompt.createdAt));
  return [...files, ...rows.map((r) => ({ name: `${CUSTOM_PREFIX}${r.id}`, label: r.name, version: r.version, custom: true }))];
}

export async function resolvePrompt(storeId: string, key: string): Promise<Prompt> {
  if (!key.startsWith(CUSTOM_PREFIX)) {
    if (!buildPromptVariants().some((p) => p.name === key)) throw new EvalSetError(`Unknown prompt "${key}"`);
    return loadPrompt(key);
  }
  const [row] = await db
    .select()
    .from(customPrompt)
    .where(and(eq(customPrompt.id, key.slice(CUSTOM_PREFIX.length)), eq(customPrompt.storeId, storeId)));
  if (!row) throw new EvalSetError("Prompt not found");
  return { name: row.name, version: row.version, system: row.system, user: row.user };
}

export async function createCustomPrompt(storeId: string, userId: string | null, input: { name: string; system: string; user: string }) {
  if (!input.user.includes("{{input}}")) throw new EvalSetError("The user message must contain {{input}}, where the product group JSON is inserted");
  const existing = await db.select({ id: customPrompt.id }).from(customPrompt).where(eq(customPrompt.storeId, storeId));
  if (existing.length >= MAX_CUSTOM_PROMPTS) throw new EvalSetError(`A store can keep at most ${MAX_CUSTOM_PROMPTS} custom prompts`);
  const id = newId("prm");
  const version = `${slugify(input.name, 40)}-${id.slice(4, 10)}`;
  await db.insert(customPrompt).values({ id, storeId, name: input.name, version, system: input.system, user: input.user, createdBy: userId });
  return { name: `${CUSTOM_PREFIX}${id}`, label: input.name, version, custom: true } satisfies PromptOption;
}

export async function deleteCustomPrompt(storeId: string, key: string) {
  if (!key.startsWith(CUSTOM_PREFIX)) throw new EvalSetError("Built-in prompts live in web/prompts and cannot be deleted here");
  const deleted = await db
    .delete(customPrompt)
    .where(and(eq(customPrompt.id, key.slice(CUSTOM_PREFIX.length)), eq(customPrompt.storeId, storeId)))
    .returning({ id: customPrompt.id });
  if (deleted.length === 0) throw new EvalSetError("Prompt not found");
}
