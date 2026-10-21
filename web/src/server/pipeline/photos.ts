import path from "node:path";
import sharp, { type Metadata } from "sharp";
import yauzl from "yauzl";
import { sha256 } from "../ids";
import { storage } from "../storage";
import type { GroupInput } from "./group";
import { IMAGE_TYPES, sniff } from "./sniff";

export const MAX_PHOTOS = 2000;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

export class PhotoArchiveError extends Error {}

export interface PhotoCandidate {
  fileName: string;
  data: Buffer;
}

export interface PhotoRecord {
  fileName: string;
  sha256: string | null;
  storageKey: string | null;
  width: number | null;
  height: number | null;
  status: "matched" | "unmatched" | "duplicate" | "invalid";
  groupKey: string | null;
  duplicateOf: string | null;
  reason: string | null;
}

function entryName(entry: yauzl.Entry) {
  return (entry.fileName as unknown as Buffer).toString("utf8");
}

function openZip(file: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true, decodeStrings: false }, (err, zip) => (err ? reject(err) : resolve(zip!))),
  );
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<Buffer>((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err);
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_PHOTO_BYTES) {
          stream.destroy(new PhotoArchiveError(`${entryName(entry)} is over the 10 MB photo limit`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    }),
  );
}

export async function* extractZip(storageKey: string): AsyncGenerator<PhotoCandidate | { skipped: string; reason: string }> {
  const zip = await openZip(storage.path(storageKey));
  if (zip.entryCount > MAX_ZIP_ENTRIES) {
    zip.close();
    throw new PhotoArchiveError(`Photo archive has ${zip.entryCount} entries, the limit is ${MAX_ZIP_ENTRIES}`);
  }

  let total = 0;
  try {
    const entries: yauzl.Entry[] = await new Promise((resolve, reject) => {
      const list: yauzl.Entry[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        list.push(e);
        zip.readEntry();
      });
      zip.on("end", () => resolve(list));
      zip.on("error", reject);
      zip.readEntry();
    });

    for (const entry of entries) {
      total += entry.uncompressedSize;
      if (total > MAX_ZIP_TOTAL_BYTES) throw new PhotoArchiveError("Photo archive is over the 2 GB uncompressed limit");
      if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO && entry.uncompressedSize > MAX_PHOTO_BYTES) {
        throw new PhotoArchiveError(`Photo archive rejected: ${entryName(entry)} expands to ${Math.round(entry.uncompressedSize / 1048576)} MB`);
      }
    }

    for (const entry of entries) {
      const name = entryName(entry).replace(/\\/g, "/");
      if (name.endsWith("/")) continue;
      const parts = name.split("/");
      const base = parts.at(-1)!;
      if (parts.includes("__MACOSX") || base.startsWith(".")) continue;
      if (name.startsWith("/") || /^[a-zA-Z]:/.test(name) || parts.includes("..")) {
        yield { skipped: name, reason: "Unsafe path in archive" };
        continue;
      }
      if (entry.uncompressedSize > MAX_PHOTO_BYTES) {
        yield { skipped: base, reason: "Over the 10 MB photo limit" };
        continue;
      }
      yield { fileName: base, data: await readEntry(zip, entry) };
    }
  } finally {
    zip.close();
  }
}

function skuIn(fileName: string, skus: string[]) {
  const stem = path.parse(fileName).name.toUpperCase().replace(/\s+/g, "");
  return skus.filter((sku) => stem === sku || (stem.startsWith(sku) && /^[^A-Z0-9]/.test(stem.slice(sku.length))));
}

export async function processPhotos(candidates: AsyncIterable<PhotoCandidate | { skipped: string; reason: string }>, groups: GroupInput[], explicit: Map<string, string>) {
  const records: PhotoRecord[] = [];
  const valid: { record: PhotoRecord; explicitGroup: string | null }[] = [];
  const skuToGroup = new Map<string, string>();
  for (const g of groups) for (const v of g.variants) if (!v.sku_derived) skuToGroup.set(v.sku, g.group_key);
  const skus = [...skuToGroup.keys()].sort((a, b) => b.length - a.length);
  const seenNames = new Set<string>();

  for await (const c of candidates) {
    if ("skipped" in c) {
      records.push({ fileName: c.skipped, sha256: null, storageKey: null, width: null, height: null, status: "invalid", groupKey: null, duplicateOf: null, reason: c.reason });
      continue;
    }
    let fileName = c.fileName;
    for (let n = 2; seenNames.has(fileName.toLowerCase()); n++) fileName = `${path.parse(c.fileName).name} (${n})${path.parse(c.fileName).ext}`;
    seenNames.add(fileName.toLowerCase());
    if (valid.length + records.length >= MAX_PHOTOS) {
      records.push({ fileName, sha256: null, storageKey: null, width: null, height: null, status: "invalid", groupKey: null, duplicateOf: null, reason: `Over the ${MAX_PHOTOS} photo limit` });
      continue;
    }

    const base = { fileName, width: null, height: null, groupKey: null, duplicateOf: null } as const;
    const type = sniff(c.data.subarray(0, 32));
    if (c.data.length === 0) {
      records.push({ ...base, sha256: null, storageKey: null, status: "invalid", reason: "The file is empty" });
      continue;
    }
    if (!IMAGE_TYPES.has(type)) {
      records.push({ ...base, sha256: null, storageKey: null, status: "invalid", reason: "Unsupported type" });
      continue;
    }
    let meta: Metadata;
    try {
      meta = await sharp(c.data, { failOn: "error" }).metadata();
      await sharp(c.data, { failOn: "error" }).resize(8).toBuffer();
    } catch {
      records.push({ ...base, sha256: null, storageKey: null, status: "invalid", reason: "Not a valid image" });
      continue;
    }
    const hash = sha256(c.data);
    const storageKey = `photos/${hash.slice(0, 2)}/${hash}.${type === "jpeg" ? "jpg" : type}`;
    await storage.writeBuffer(storageKey, c.data);
    const record: PhotoRecord = { ...base, sha256: hash, storageKey, width: meta.width ?? null, height: meta.height ?? null, status: "unmatched", reason: null };
    valid.push({ record, explicitGroup: explicit.get(fileName.toLowerCase()) ?? null });
  }

  const byHash = new Map<string, typeof valid>();
  for (const v of valid) {
    const list = byHash.get(v.record.sha256!) ?? [];
    list.push(v);
    byHash.set(v.record.sha256!, list);
  }
  for (const list of byHash.values()) {
    list.sort((a, b) => Number(!!b.explicitGroup) - Number(!!a.explicitGroup) || a.record.fileName.length - b.record.fileName.length || a.record.fileName.localeCompare(b.record.fileName));
    const [keep, ...dupes] = list;
    for (const d of dupes) {
      d.record.status = "duplicate";
      d.record.duplicateOf = keep.record.fileName;
      d.record.reason = `Same image as ${keep.record.fileName}`;
    }
    const target = keep.explicitGroup ?? (() => {
      const hits = [...new Set(skuIn(keep.record.fileName, skus).map((s) => skuToGroup.get(s)!))];
      if (hits.length > 1) keep.record.reason = "Matches several products";
      return hits.length === 1 ? hits[0] : null;
    })();
    if (target) {
      keep.record.status = "matched";
      keep.record.groupKey = target;
    }
  }

  const all = [...records, ...valid.map((v) => v.record)];
  const groupsByKey = new Map(groups.map((g) => [g.group_key, g]));
  for (const r of all) {
    if (r.status === "matched") groupsByKey.get(r.groupKey!)!.photos.push({ file_name: r.fileName, sha256: r.sha256!, storage_key: r.storageKey! });
  }
  for (const g of groups) g.photos.sort((a, b) => a.file_name.localeCompare(b.file_name));
  return all;
}
