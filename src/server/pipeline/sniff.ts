export type FileType = "text" | "zip" | "pdf" | "jpeg" | "png" | "webp" | "gif" | "heic" | "binary" | "empty";

export function sniff(head: Buffer): FileType {
  if (head.length === 0) return "empty";
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) return "zip";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (starts(0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (head.length >= 12 && head.toString("ascii", 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|avif)/.test(head.toString("ascii", 8, 12))) {
    return "heic";
  }
  if (head.subarray(0, 4096).includes(0x00)) {
    const utf16 = starts(0xff, 0xfe) || starts(0xfe, 0xff);
    return utf16 ? "text" : "binary";
  }
  return "text";
}

export const IMAGE_TYPES: ReadonlySet<FileType> = new Set(["jpeg", "png", "webp", "gif", "heic"]);
