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

const MEASUREMENT = /\d+(?:[.,]\d+)?\s?(?:mm|cm|m|kg|g|ml|cl|l|W|V|°C|°F|in|lbs?|oz)(?![\p{L}\d])|\bE\d{2}\b/gu;
const BRACED = /\{\{[^{}]+\}\}/g;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface MaskToken {
  text: string;
  measurement: boolean;
}

export function maskFields(fields: Record<string, string>, protectedNames: string[]) {
  const tokens: MaskToken[] = [];
  const names = [...new Set(protectedNames.filter((n) => n.trim().length > 1))].sort((a, b) => b.length - a.length);
  const patterns = [BRACED, ...names.map((n) => new RegExp(escapeRegex(n), "g")), MEASUREMENT];
  const masked: Record<string, string> = {};
  for (const [key, text] of Object.entries(fields)) {
    let out = text;
    for (const pattern of patterns) {
      out = out
        .split(/(<[^>]*>|⟦\d+⟧)/)
        .map((part, i) => (i % 2 ? part : part.replace(pattern, (m) => `⟦${tokens.push({ text: m, measurement: pattern === MEASUREMENT }) - 1}⟧`)))
        .join("");
    }
    masked[key] = out;
  }
  return { masked, tokens };
}

export function unmask(text: string, tokens: MaskToken[], locale: TranslateLocale) {
  return text.replace(/⟦(\d+)⟧/g, (m, n: string) => {
    const token = tokens[Number(n)];
    if (!token) return m;
    return token.measurement ? token.text.replace(/(\d)\.(\d)/, `$1${locale === "de" || locale === "fr" ? "," : "."}$2`) : token.text;
  });
}

export interface LocaleResult {
  fields: Record<string, string>;
  failed: Record<string, string>;
}

export interface TranslateResult {
  byLocale: Partial<Record<TranslateLocale, LocaleResult>>;
  promptVersion: string;
  usage: Usage;
  latencyMs: number;
}

/** Translates into every requested language in one call; `keys` lists the fields each language needs. */
export async function translateFields(
  model: string,
  fields: Record<string, string>,
  keys: Partial<Record<TranslateLocale, string[]>>,
  protectedNames: string[],
): Promise<TranslateResult> {
  const prompt = loadPrompt("translate");
  const locales = (Object.keys(keys) as TranslateLocale[]).filter((l) => keys[l]?.length);
  const { masked, tokens } = maskFields(fields, protectedNames);
  const schema = z.object(
    Object.fromEntries(locales.map((l) => [l, z.object(Object.fromEntries(keys[l]!.map((k) => [k, z.string()])) as Record<string, z.ZodString>)])),
  );
  const jsonSchema = toResponseSchema(z.toJSONSchema(schema) as Record<string, unknown>);
  const targets = locales.map((l) => `- \`${l}\`: ${LOCALES[l].language} for ${LOCALES[l].market}, formal address (${LOCALES[l].formality})`).join("\n");
  const wanted = Object.fromEntries(locales.map((l) => [l, keys[l]]));

  let result;
  try {
    result = await generateJson({
      model,
      system: render(prompt.system, { targets, protected: protectedNames.length ? protectedNames.map((n) => `"${n}"`).join(", ") : "(none)" }),
      content: [{ type: "text", text: render(prompt.user, { fields: JSON.stringify(masked, null, 2), keys: JSON.stringify(wanted) }) }],
      jsonSchema,
      effort: "low",
      maxOutputTokens: 4096 * locales.length,
    });
  } catch (error) {
    throw Object.assign(error as Error, { promptVersion: prompt.version, ...(usageOf(error) ?? {}) });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(result.text));
  } catch {
    throw Object.assign(new AiError("invalid_output", "Translation did not match the schema"), { promptVersion: prompt.version, usage: result.usage, latencyMs: result.latencyMs });
  }

  const byLocale: TranslateResult["byLocale"] = {};
  for (const locale of locales) {
    const out = parsed[locale] as Record<string, string>;
    const ok: Record<string, string> = {};
    const failed: Record<string, string> = {};
    for (const key of keys[locale]!) {
      const problem = checkTranslation(masked[key], out[key], []);
      if (problem) failed[key] = problem;
      else ok[key] = unmask(out[key], tokens, locale);
    }
    byLocale[locale] = { fields: ok, failed };
  }
  return { byLocale, promptVersion: prompt.version, usage: result.usage, latencyMs: result.latencyMs };
}
