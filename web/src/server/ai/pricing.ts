interface Rate {
  input: number;
  output: number;
  from?: string;
}

const USD_PER_MILLION: Record<string, Rate[]> = {
  "gemini-3.1-flash-lite": [{ input: 0.25, output: 1.5 }],
  "gemini-3.5-flash-lite": [{ input: 0.3, output: 2.5 }],
  "gemini-3.6-flash": [
    { input: 0.75, output: 3.75 },
    { input: 1.5, output: 7.5, from: "2027-01-01" },
  ],
  "gemini-3.8-flash": [
    { input: 0.75, output: 3.75 },
    { input: 1.5, output: 7.5, from: "2027-01-01" },
  ],
  "gemini-3.1-pro-preview": [{ input: 2, output: 12 }],
  mock: [{ input: 0, output: 0 }],
};

export function rateFor(model: string, at = new Date()): Rate | null {
  const rates = USD_PER_MILLION[model];
  if (!rates) return null;
  return [...rates].reverse().find((r) => !r.from || at >= new Date(r.from)) ?? rates[0];
}

export function costMicros(model: string, inputTokens: number, outputTokens: number, opts: { batch?: boolean; at?: Date } = {}) {
  const rate = rateFor(model, opts.at);
  if (!rate) return 0;
  const usdMicros = inputTokens * rate.input + outputTokens * rate.output;
  return Math.round(opts.batch ? usdMicros / 2 : usdMicros);
}
