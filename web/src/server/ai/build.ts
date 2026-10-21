import type { Part } from "@google/genai";
import sharp from "sharp";
import { z } from "zod";
import type { GroupInput } from "../pipeline/group";
import { htmlToText, sanitizeHtml } from "../pipeline/text";
import { TAXONOMY, isCategory } from "../pipeline/taxonomy";
import { storage } from "../storage";
import { AiError, type Usage, generateJson, toResponseSchema, usageOf } from "./gemini";
import { loadPrompt, render } from "./prompts";
import { unsupportedTerms, verifyClaims } from "./verify";

export const LOW_CONFIDENCE = 70;
const REQUIRED_FIELDS = ["title", "description_html", "category"] as const;
const MAX_PHOTOS_PER_CALL = 3;

const score = z.number().min(0).max(100);

export const buildOutputSchema = z.object({
  title: z.string().min(1).max(150),
  description_html: z.string().max(6000),
  category: z.string().min(1).describe("One value from the taxonomy list"),
  tags: z.array(z.string().min(1).max(40)).max(12),
  attributes: z.array(z.object({ key: z.string().min(1).max(40), value: z.string().min(1).max(200), source: z.string().max(80) })).max(20),
  claims: z
    .array(z.object({ text: z.string().min(1).max(80), source_row: z.number().int(), source_column: z.string().min(1), quote: z.string().min(1).max(300) }))
    .max(20),
  seo: z.object({ meta_title: z.string().max(90), meta_description: z.string().max(200) }),
  confidence: z.array(z.object({ field: z.string().min(1), score })).max(40),
  concerns: z.array(z.string().max(300)).max(10),
});

export type BuildOutput = z.infer<typeof buildOutputSchema>;

const jsonSchema = toResponseSchema(z.toJSONSchema(buildOutputSchema) as Record<string, unknown>);

export interface AiCallRecord {
  model: string;
  promptVersion: string;
  task: "build" | "repair" | "translate";
  usage: Usage;
  latencyMs: number;
  ok: boolean;
  errorCode: string | null;
}

export interface BuiltProduct {
  title: string;
  descriptionHtml: string;
  category: string;
  tags: string[];
  attributes: Record<string, string>;
  claims: { text: string; source: string }[];
  confidence: Record<string, number>;
  seo: { meta_title: string; meta_description: string };
  reviewReasons: string[];
}

function promptInput(group: GroupInput, note?: string) {
  return JSON.stringify(
    {
      ...(note ? { merchant_note: note } : {}),
      group_key: group.group_key,
      rows: group.rows,
      variants: group.variants.map(({ sku, options }) => ({ sku, options })),
      attributes: group.attributes,
      review_reasons: group.review_reasons,
      description_truncated: group.truncated,
      photos: group.photos.map((p) => p.file_name),
    },
    null,
    2,
  );
}

async function photoParts(group: GroupInput): Promise<Part[]> {
  const parts: Part[] = [];
  for (const p of group.photos.slice(0, MAX_PHOTOS_PER_CALL)) {
    try {
      const data = await sharp(await storage.read(p.storage_key)).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      parts.push({ text: `Photo ${p.file_name}:` }, { inlineData: { mimeType: "image/jpeg", data: data.toString("base64") } });
    } catch {
      continue;
    }
  }
  return parts;
}

function parseOutput(text: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false as const, errors: `Not valid JSON: ${(error as Error).message}` };
  }
  const parsed = buildOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false as const, errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n") };
  }
  return { ok: true as const, value: parsed.data };
}

export async function generateBuild(group: GroupInput, model: string, opts: { withPhotos: boolean; maxOutputTokens: number; note?: string }) {
  const prompt = loadPrompt("build-product");
  const calls: AiCallRecord[] = [];
  const record = (task: AiCallRecord["task"], version: string, usage: Usage, latencyMs: number, ok: boolean, errorCode: string | null) =>
    calls.push({ model, promptVersion: version, task, usage, latencyMs, ok, errorCode });

  const parts: Part[] = [{ text: render(prompt.user, { input: promptInput(group, opts.note) }) }];
  if (opts.withPhotos) parts.push(...(await photoParts(group)));
  const system = render(prompt.system, { taxonomy: TAXONOMY.map((c) => `- ${c}`).join("\n") });

  let result;
  try {
    result = await generateJson({ model, system, parts, jsonSchema, maxOutputTokens: opts.maxOutputTokens, thinking: "low", temperature: 0.2 });
  } catch (error) {
    const used = usageOf(error);
    record("build", prompt.version, used?.usage ?? { inputTokens: 0, outputTokens: 0 }, used?.latencyMs ?? 0, false, (error as AiError).kind ?? "unknown");
    throw Object.assign(error as Error, { calls });
  }
  record("build", prompt.version, result.usage, result.latencyMs, true, null);

  let parsed = parseOutput(result.text);
  if (!parsed.ok) {
    const repair = loadPrompt("repair-json");
    try {
      const fixed = await generateJson({
        model,
        system: repair.system,
        parts: [{ text: render(repair.user, { errors: parsed.errors, output: result.text.slice(0, 20_000) }) }],
        jsonSchema,
        maxOutputTokens: opts.maxOutputTokens,
        thinking: "minimal",
        temperature: 0,
      });
      record("repair", repair.version, fixed.usage, fixed.latencyMs, true, null);
      parsed = parseOutput(fixed.text);
    } catch (error) {
      const used = usageOf(error);
      record("repair", repair.version, used?.usage ?? { inputTokens: 0, outputTokens: 0 }, used?.latencyMs ?? 0, false, (error as AiError).kind ?? "unknown");
    }
  }
  if (!parsed.ok) throw Object.assign(new AiError("invalid_output", "Model output did not match the schema"), { calls });

  return { output: parsed.value, promptVersion: prompt.version, calls };
}

export function finalizeBuild(group: GroupInput, output: BuildOutput): BuiltProduct {
  const reasons = [...group.review_reasons];

  const verified = verifyClaims(group, output.claims);
  for (const r of verified.rejected) reasons.push(`Removed unsupported claim "${r.text}": ${r.reason}`);

  const descriptionHtml = sanitizeHtml(output.description_html);
  const attributes: Record<string, string> = { ...group.attributes };
  for (const a of output.attributes) {
    const key = a.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!(key in group.attributes)) attributes[key] = a.value.trim();
  }

  const confidence: Record<string, number> = {};
  for (const c of output.confidence) confidence[c.field] = Math.round(c.score);
  for (const key of Object.keys(group.attributes)) confidence[`attributes.${key}`] ??= 95;

  let category = output.category.trim();
  if (!isCategory(category)) {
    reasons.push(`Category not recognised: "${category}"`);
    category = "Other";
    confidence.category = 0;
  }

  for (const field of REQUIRED_FIELDS) {
    const value = confidence[field];
    if (value === undefined) reasons.push(`No confidence given for ${field}`);
    else if (value < LOW_CONFIDENCE) reasons.push(`Low confidence on ${field} (${value}%)`);
  }

  const textOut = [output.title, htmlToText(descriptionHtml), output.tags.join(" "), Object.values(attributes).join(" "), output.seo.meta_title, output.seo.meta_description].join(" ");
  for (const term of unsupportedTerms(group, textOut, verified.kept)) reasons.push(`Mentions "${term}" with no source`);

  for (const concern of output.concerns) if (concern.trim()) reasons.push(`Model: ${concern.trim()}`);

  return {
    title: output.title.trim(),
    descriptionHtml,
    category,
    tags: [...new Set(output.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    attributes,
    claims: verified.kept,
    confidence,
    seo: { meta_title: output.seo.meta_title.slice(0, 70), meta_description: output.seo.meta_description.slice(0, 170) },
    reviewReasons: [...new Set(reasons)],
  };
}
