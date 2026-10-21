type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /secret|token|password|authorization|cookie|api_?key|prompt|cells|description|supplier_?text/i;
const SECRET_VALUE = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bcf_[A-Za-z0-9_-]{16,}/g,
  /\bwhsec_[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /(\w+:\/\/[^:/\s]+:)[^@\s]+@/g,
];

function scrubString(value: string) {
  return SECRET_VALUE.reduce((s, pattern) => s.replace(pattern, (m, prefix?: string) => (typeof prefix === "string" && m.startsWith(prefix) ? `${prefix}[redacted]@` : "[redacted]")), value);
}

export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "[redacted]" : scrub(v, depth + 1)]));
}

function write(level: "info" | "warn" | "error", msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(scrub(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
