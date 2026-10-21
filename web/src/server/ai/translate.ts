import { z } from "zod";
import { AiError, generateJson, toResponseSchema, type Usage, usageOf } from "./anthropic";
import { loadPrompt, render } from "./prompts";

export type TranslateLocale = "de" | "fr";

const LOCALES: Record<TranslateLocale, { language: string; market: string; formality: string }> = {
  de: { language: "German", market: "Germany and Austria", formality: "Sie" },
  fr: { language: "French", market: "France", formality: "vous" },
};

const PLACEHOLDER = /\{\{[^{}]+\}\}|⟦\d+⟧/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
const TAG = /<\/?([a-z0-9]+)[^>]*>/gi;

function tags(html: string) {
  return [...html.matchAll(TAG)].map((m) => m[0].replace(/\s+/g, " ").toLowerCase());
}

function numbers(text: string) {
  return [...text.replace(TAG, " ").matchAll(NUMBER)].map((m) => m[0].replace(",", ".")).sort();
}

export function checkTranslation(source: string, target: string, protectedNames: string[]): string | null {
  if (!target.trim() && source.trim()) return "empty translation";
  const srcPh = (source.match(PLACEHOLDER) ?? []).sort().join("|");
  const tgtPh = (target.match(PLACEHOLDER) ?? []).sort().join("|");
  if (srcPh !== tgtPh) return "placeholders changed";
  if (tags(source).join("") !== tags(target).join("")) return "HTML tags changed";
  if (numbers(source).join("|") !== numbers(target).join("|")) return "numbers changed";
  for (const name of protectedNames) {
    if (source.includes(name) && !target.includes(name)) return `protected name "${name}" was changed`;
  }
  return null;
}

export interface TranslateResult {
  fields: Record<string, string>;
  failed: Record<string, string>;
  promptVersion: string;
  usage: Usage;
  latencyMs: number;
}

export async function translateFields(model: string, locale: TranslateLocale, fields: Record<string, string>, protectedNames: string[]): Promise<TranslateResult> {
  const prompt = loadPrompt("translate");
  const info = LOCALES[locale];
  const keys = Object.keys(fields);
  const schema = z.object(Object.fromEntries(keys.map((k) => [k, z.string()])) as Record<string, z.ZodString>);
  const jsonSchema = toResponseSchema(z.toJSONSchema(schema) as Record<string, unknown>);

  let result;
  try {
    result = await generateJson({
      model,
      system: render(prompt.system, { ...info, protected: protectedNames.length ? protectedNames.map((n) => `"${n}"`).join(", ") : "(none)" }),
      content: [{ type: "text", text: render(prompt.user, { fields: JSON.stringify(fields, null, 2) }) }],
      jsonSchema,
      effort: "low",
      maxOutputTokens: 4096,
    });
  } catch (error) {
    throw Object.assign(error as Error, { promptVersion: prompt.version, ...(usageOf(error) ?? {}) });
  }

  let parsed: Record<string, string>;
  try {
    parsed = schema.parse(JSON.parse(result.text));
  } catch {
    throw Object.assign(new AiError("invalid_output", "Translation did not match the schema"), { promptVersion: prompt.version, usage: result.usage, latencyMs: result.latencyMs });
  }

  const ok: Record<string, string> = {};
  const failed: Record<string, string> = {};
  for (const key of keys) {
    const problem = checkTranslation(fields[key], parsed[key], protectedNames);
    if (problem) failed[key] = problem;
    else ok[key] = parsed[key];
  }
  return { fields: ok, failed, promptVersion: prompt.version, usage: result.usage, latencyMs: result.latencyMs };
}
