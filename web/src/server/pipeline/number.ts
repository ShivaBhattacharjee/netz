export type DecimalHint = "," | ".";

const THOUSANDS_DOT = /^\d{1,3}(\.\d{3})+$/;
const THOUSANDS_COMMA = /^\d{1,3}(,\d{3})+$/;

export function splitDecimal(raw: string, hint: DecimalHint = "."): { int: string; frac: string } | null {
  const s = raw.replace(/[\s'’]/g, "");
  if (!/^\d[\d.,]*$/.test(s) && !/^[.,]\d+$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimal: DecimalHint | null;
  if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0) decimal = THOUSANDS_COMMA.test(s) && (s.split(",").length > 2 || hint === ".") ? null : ",";
  else if (lastDot >= 0) decimal = THOUSANDS_DOT.test(s) && (s.split(".").length > 2 || hint === ",") ? null : ".";
  else decimal = null;

  if (decimal === null) return { int: s.replace(/[.,]/g, "") || "0", frac: "" };
  const at = s.lastIndexOf(decimal);
  const int = s.slice(0, at).replace(/[.,]/g, "") || "0";
  const frac = s.slice(at + 1);
  if (/[.,]/.test(frac)) return null;
  return { int, frac };
}

export function toNumber(raw: string, hint: DecimalHint = "."): number | null {
  const parts = splitDecimal(raw, hint);
  if (!parts) return null;
  return Number(`${parts.int}.${parts.frac || "0"}`);
}

export function decimalStyle(raw: string): DecimalHint | null {
  const s = raw.replace(/[^\d.,]/g, "");
  if (/,\d{1,2}$/.test(s) || /^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return ",";
  if (/\.\d{1,2}$/.test(s) || /^\d{1,3}(,\d{3})+\.\d+$/.test(s)) return ".";
  return null;
}
