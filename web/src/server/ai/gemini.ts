import { ApiError, GoogleGenAI, type Part, ThinkingLevel } from "@google/genai";

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
  parts: Part[];
  jsonSchema: unknown;
  temperature?: number;
  maxOutputTokens?: number;
  thinking?: "minimal" | "low" | "medium" | "high";
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  usage: Usage;
  latencyMs: number;
}

const THINKING: Record<NonNullable<GenerateRequest["thinking"]>, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const BLOCKED_FINISH = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"]);

let client: GoogleGenAI | undefined;

function genai() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("auth", "GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

function retryDelayMs(message: string): number | undefined {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

export function classify(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof ApiError) {
    const message = error.message ?? "";
    if (error.status === 402 || /prepayment credits|billing/i.test(message)) {
      return new AiError("billing", "Gemini credits are used up or billing is not set up for this key's project");
    }
    if (error.status === 429) {
      const daily = /PerDay|per day|daily/i.test(message);
      return new AiError(daily ? "quota_daily" : "rate_limit", daily ? "Daily AI quota reached" : "AI rate limit reached", retryDelayMs(message));
    }
    if (error.status === 401 || error.status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(message)) {
      return new AiError("auth", "AI key is invalid or has no access to this model");
    }
    if (error.status === 404) return new AiError("bad_request", `Model not found: ${message.slice(0, 200)}`);
    if (error.status === 408 || error.status === 504) return new AiError("timeout", "AI request timed out");
    if (error.status >= 500) return new AiError("unavailable", `AI provider error ${error.status}`);
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
    response = await genai().models.generateContent({
      model: req.model,
      contents: [{ role: "user", parts: req.parts }],
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: req.jsonSchema,
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 4096,
        thinkingConfig: { thinkingLevel: THINKING[req.thinking ?? "low"] },
        httpOptions: { timeout: req.timeoutMs ?? 60_000 },
      },
    });
  } catch (error) {
    throw classify(error);
  }

  const latencyMs = Date.now() - started;
  const meta = response.usageMetadata;
  const usage: Usage = {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
  };

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) throw Object.assign(new AiError("blocked", `Model declined the input (${blockReason})`), { usage, latencyMs });

  const finish = response.candidates?.[0]?.finishReason;
  if (finish && BLOCKED_FINISH.has(finish)) throw Object.assign(new AiError("blocked", `Model declined to generate (${finish})`), { usage, latencyMs });
  if (finish === "MAX_TOKENS") throw Object.assign(new AiError("truncated", "Model output was cut off"), { usage, latencyMs });

  const text = response.text;
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
  return copy;
}
