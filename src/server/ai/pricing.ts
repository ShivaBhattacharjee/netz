import type { Usage } from "./anthropic";

interface Rate {
  input: number;
  output: number;
  from?: string;
}

const USD_PER_MILLION: Record<string, Rate[]> = {
  "claude-haiku-5-5": [{ input: 0.1, output: 0.5 }],
  "claude-sonnet-5-5": [{ input: 2, output: 10 }],
  mock: [{ input: 0, output: 0 }],
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export function rateFor(model: string, at = new Date()): Rate | null {
  const rates = USD_PER_MILLION[model];
  if (!rates) return null;
  return [...rates].reverse().find((r) => !r.from || at >= new Date(r.from)) ?? rates[0];
}

export function costMicros(model: string, usage: Usage, opts: { batch?: boolean; at?: Date } = {}) {
  const rate = rateFor(model, opts.at);
  if (!rate) return 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const uncached = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const input = uncached + cacheRead * CACHE_READ_MULTIPLIER + cacheWrite * CACHE_WRITE_MULTIPLIER;
  const usdMicros = input * rate.input + usage.outputTokens * rate.output;
  return Math.round(opts.batch ? usdMicros / 2 : usdMicros);
}
