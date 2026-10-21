import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError } from "@anthropic-ai/sdk";
import { transformJSONSchema } from "@anthropic-ai/sdk/lib/transform-json-schema";
import type { ContentBlockParam, OutputConfig } from "@anthropic-ai/sdk/resources/messages";
import { env } from "../env";

export type AiErrorKind =
  | "rate_limit"
  | "quota_daily"
  | "unavailable"
  | "timeout"
  | "auth"
  | "billing"
  | "bad_request"
  | "blocked"
  | "truncated"
  | "invalid_output";

const RETRYABLE: ReadonlySet<AiErrorKind> = new Set(["rate_limit", "quota_daily", "unavailable", "timeout", "truncated", "invalid_output"]);

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
  get retryable() {
    return RETRYABLE.has(this.kind);
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateRequest {
  model: string;
  system: string;
  content: ContentBlockParam[];
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  effort?: NonNullable<OutputConfig["effort"]>;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  usage: Usage;
  latencyMs: number;
}

let client: Anthropic | undefined;

function anthropic() {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("auth", "ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, maxRetries: 0 });
  return client;
}

/** Resolves each model ID or alias against the models endpoint; returns the ones that do not exist. */
export async function missingModels(models: string[]) {
  const missing: string[] = [];
  for (const id of new Set(models)) {
    try {
      await anthropic().models.retrieve(id, {}, { timeout: 15_000 });
    } catch (error) {
      if (error instanceof APIError && error.status === 404) missing.push(id);
      else throw classify(error);
    }
  }
  return missing;
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const value = Number(headers?.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value * 1000) : undefined;
}

export function classify(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof APIConnectionTimeoutError) return new AiError("timeout", "AI request timed out");
  if (error instanceof APIConnectionError) return new AiError("unavailable", "Network error talking to the AI provider");
  if (error instanceof APIError && error.status !== undefined) {
    const message = error.message ?? "";
    if (error.status === 402 || /credit balance|billing|usage limits/i.test(message)) {
      return new AiError("billing", "Anthropic credits are used up or the workspace hit its spend limit");
    }
    if (error.status === 429) return new AiError("rate_limit", "AI rate limit reached", retryAfterMs(error.headers));
    if (error.status === 401 || error.status === 403) return new AiError("auth", "AI key is invalid or has no access to this model");
    if (error.status === 404) return new AiError("bad_request", `Model not found: ${message.slice(0, 200)}`);
    if (error.status === 408 || error.status === 504) return new AiError("timeout", "AI request timed out");
    if (error.status >= 500) return new AiError("unavailable", `AI provider error ${error.status}`, retryAfterMs(error.headers));
    return new AiError("bad_request", `AI request rejected (${error.status}): ${message.slice(0, 300)}`);
  }
  const e = error as { name?: string; message?: string; code?: string };
  if (e?.name === "AbortError" || e?.name === "TimeoutError" || /timed? ?out/i.test(e?.message ?? "")) {
    return new AiError("timeout", "AI request timed out");
  }
  if (["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET"].includes(e?.code ?? "")) {
    return new AiError("unavailable", `Network error talking to the AI provider (${e.code})`);
  }
  return new AiError("unavailable", e?.message ?? "Unknown AI error");
}

export async function generateJson(req: GenerateRequest): Promise<GenerateResult> {
  const started = Date.now();
  let response;
  try {
    response = await anthropic().messages.create(
      {
        model: req.model,
        system: req.system,
        messages: [{ role: "user", content: req.content }],
        max_tokens: req.maxOutputTokens ?? 4096,
        output_config: { effort: req.effort ?? "low", format: { type: "json_schema", schema: req.jsonSchema } },
      },
      { timeout: req.timeoutMs ?? 60_000 },
    );
  } catch (error) {
    throw classify(error);
  }

  const latencyMs = Date.now() - started;
  const usage: Usage = {
    inputTokens: response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };

  switch (response.stop_reason) {
    case "refusal":
      throw Object.assign(new AiError("blocked", "Model declined to generate (refusal)"), { usage, latencyMs });
    case "max_tokens":
      throw Object.assign(new AiError("truncated", "Model output was cut off"), { usage, latencyMs });
    case "model_context_window_exceeded":
      throw Object.assign(new AiError("bad_request", "Input is too large for the model's context window"), { usage, latencyMs });
  }

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  if (!text) throw Object.assign(new AiError("invalid_output", "Model returned no text"), { usage, latencyMs });
  return { text, usage, latencyMs };
}

export function usageOf(error: unknown): { usage: Usage; latencyMs: number } | null {
  const e = error as { usage?: Usage; latencyMs?: number };
  return e?.usage ? { usage: e.usage, latencyMs: e.latencyMs ?? 0 } : null;
}

export function toResponseSchema(schema: Record<string, unknown>) {
  const copy = { ...schema };
  delete copy.$schema;
  return transformJSONSchema(copy);
}
