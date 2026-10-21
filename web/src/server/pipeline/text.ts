import sanitize from "sanitize-html";

const CP1252_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

const MOJIBAKE = /[ÃÂâ][\u0080-¿Œ-™]/;

export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(buffer.subarray(2)), encoding: "utf-16le" };
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(buffer.subarray(2)), encoding: "utf-16be" };
  const body = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(body), encoding: "windows-1252" };
  }
}

export function repairMojibake(value: string): { value: string; repaired: boolean } {
  if (!MOJIBAKE.test(value)) return { value, repaired: false };
  const bytes: number[] = [];
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) bytes.push(code);
    else if (CP1252_EXTRA[ch] !== undefined) bytes.push(CP1252_EXTRA[ch]);
    else return { value, repaired: false };
  }
  try {
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    return { value: fixed, repaired: fixed !== value };
  } catch {
    return { value, repaired: false };
  }
}

export function cleanCell(value: unknown): { value: string; repaired: boolean } {
  const raw = String(value ?? "")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .trim();
  return repairMojibake(raw);
}

const ALLOWED_HTML: sanitize.IOptions = {
  allowedTags: ["p", "ul", "ol", "li", "strong", "em", "br", "a"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "noscript", "iframe", "object"],
};

export function sanitizeHtml(html: string) {
  return sanitize(html, ALLOWED_HTML).trim();
}

export function htmlToText(html: string) {
  return sanitize(html.replace(/<(br|\/p|\/li)\s*\/?>/gi, "$& "), { allowedTags: [], allowedAttributes: {}, nonTextTags: ALLOWED_HTML.nonTextTags })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}°% ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string, max = 80) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "product"
  );
}

const GERMAN = /\b(und|mit|aus|der|die|das|für|fur|ein|eine|topf|korb|kissen|bezug|leuchte|handgedreht|geflochten|griffen|abzugsloch)\b|[äöüß]/i;
const FRENCH = /\b(et|avec|pour|une|des|les|du|en|coton|lin|verre|fait main)\b|[éèêàçù]/i;

export function detectLanguage(text: string): "en" | "de" | "fr" | "unknown" {
  if (!text.trim()) return "unknown";
  if (GERMAN.test(text)) return "de";
  if (FRENCH.test(text)) return "fr";
  return "en";
}
