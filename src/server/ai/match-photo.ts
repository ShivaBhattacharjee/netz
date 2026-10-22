import sharp from "sharp";
import { z } from "zod";
import { storage } from "../storage";
import { AiError, generateJson, toResponseSchema, usageOf } from "./anthropic";
import type { AiCallRecord } from "./build";
import { loadPrompt, render } from "./prompts";

export const AUTO_ATTACH_CONFIDENCE = 85;
export const SUGGEST_CONFIDENCE = 50;
export const MAX_CANDIDATES = 400;

export interface MatchCandidate {
  groupKey: string;
  title: string;
  skus: string[];
  options: string[];
  details: string[];
}

export const matchOutputSchema = z.object({
  match: z.string().nullable().describe("Catalog ID such as P3, or null"),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(300),
});

const jsonSchema = toResponseSchema(z.toJSONSchema(matchOutputSchema) as Record<string, unknown>);

function words(text: string) {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !/^\d+$/.test(w)));
}

/** Keeps the catalog prompt bounded: past the cap, products sharing words with the file name come first. */
export function shortlist(candidates: MatchCandidate[], fileName: string) {
  if (candidates.length <= MAX_CANDIDATES) return candidates;
  const name = words(fileName.replace(/\.[^.]+$/, ""));
  const overlap = (c: MatchCandidate) => [...words(`${c.title} ${c.options.join(" ")} ${c.details.join(" ")}`)].filter((w) => name.has(w)).length;
  return candidates
    .map((c, i) => ({ c, i, score: overlap(c) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_CANDIDATES)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
}

export function catalogText(candidates: MatchCandidate[]) {
  return candidates
    .map((c, i) => {
      const details = c.details.length ? ` | ${c.details.join(", ")}` : "";
      const options = c.options.length ? ` | options: ${c.options.join(", ")}` : "";
      return `P${i + 1} | ${c.title}${details} | SKUs: ${c.skus.slice(0, 8).join(", ") || "none"}${options}`;
    })
    .join("\n");
}

export async function matchPhoto(file: { fileName: string; storageKey: string }, candidates: MatchCandidate[], model: string) {
  const prompt = loadPrompt("match-photo");
  const data = await sharp(await storage.read(file.storageKey)).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const calls: AiCallRecord[] = [];

  let result;
  try {
    result = await generateJson({
      model,
      system: render(prompt.system, { catalog: catalogText(candidates) }),
      content: [
        { type: "text", text: render(prompt.user, { file_name: file.fileName.replace(/`/g, "'") }) },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") } },
      ],
      jsonSchema,
      maxOutputTokens: 1024,
      effort: "low",
    });
  } catch (error) {
    const used = usageOf(error);
    calls.push({ model, promptVersion: prompt.version, task: "match", usage: used?.usage ?? { inputTokens: 0, outputTokens: 0 }, latencyMs: used?.latencyMs ?? 0, ok: false, errorCode: (error as AiError).kind ?? "unknown" });
    throw Object.assign(error as Error, { calls });
  }
  calls.push({ model, promptVersion: prompt.version, task: "match", usage: result.usage, latencyMs: result.latencyMs, ok: true, errorCode: null });

  let parsed;
  try {
    parsed = matchOutputSchema.safeParse(JSON.parse(result.text));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) throw Object.assign(new AiError("invalid_output", "Model output did not match the schema"), { calls });

  const index = parsed.data.match ? Number(parsed.data.match.trim().replace(/^P/i, "")) - 1 : -1;
  const candidate = Number.isInteger(index) ? candidates[index] : undefined;
  return {
    groupKey: candidate?.groupKey ?? null,
    confidence: candidate ? Math.round(parsed.data.confidence) : 0,
    reason: parsed.data.reason.trim(),
    calls,
  };
}
