import { type DecimalHint, splitDecimal } from "./number";

export interface Price {
  cents: number | null;
  currency: string;
  currencyDefaulted: boolean;
  error?: string;
}

const SYMBOLS: [RegExp, string][] = [
  [/€|\beur(o|os)?\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\bchf\b|\bfr\.?(?=\s|\d|$)/i, "CHF"],
  [/us\$|\$|\busd\b/i, "USD"],
];

export function parsePrice(raw: string, defaultCurrency: string, hint: DecimalHint = "."): Price | null {
  let s = raw.trim();
  if (!s) return null;

  let currency: string | null = null;
  for (const [pattern, code] of SYMBOLS) {
    if (pattern.test(s)) {
      currency = code;
      s = s.replace(pattern, " ");
      break;
    }
  }
  s = s
    .replace(/,[-–—]$/, ",00")
    .replace(/\.[-–—]$/, ".00")
    .replace(/[^\d.,'’\s-]/g, "")
    .trim();
  const resolvedCurrency = currency ?? defaultCurrency;
  const base = { currency: resolvedCurrency, currencyDefaulted: currency === null };

  if (!s) return { cents: null, ...base, error: `Could not read price "${raw}"` };
  if (s.startsWith("-")) return { cents: null, ...base, error: `Negative price "${raw}"` };

  const parts = splitDecimal(s, hint);
  if (!parts) return { cents: null, ...base, error: `Could not read price "${raw}"` };

  const frac = parts.frac.padEnd(2, "0");
  let cents = Number(parts.int) * 100 + Number(frac.slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return { cents: null, ...base, error: `Price out of range "${raw}"` };
  if (cents === 0) return { cents: null, ...base, error: "Price is 0" };
  return { cents, ...base };
}
