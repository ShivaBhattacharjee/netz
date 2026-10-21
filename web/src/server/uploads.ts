import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { newId } from "./ids";
import { type FileType, IMAGE_TYPES, sniff } from "./pipeline/sniff";
import { storage } from "./storage";

export type UploadKind = "sheet" | "zip" | "photo";

export const UPLOAD_LIMITS: Record<UploadKind, number> = {
  sheet: 25 * 1024 * 1024,
  zip: 1024 * 1024 * 1024,
  photo: 10 * 1024 * 1024,
};

const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function checkType(kind: UploadKind, fileName: string, type: FileType): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (type === "empty") throw new UploadError(`${fileName} is empty`);
  if (kind === "sheet") {
    if (ext === "csv" || ext === "txt" || ext === "tsv") {
      if (type !== "text") throw new UploadError(`${fileName} is not a text CSV (looks like ${type.toUpperCase()})`);
      return "text/csv";
    }
    if (ext === "xlsx") {
      if (type !== "zip") throw new UploadError(`${fileName} is not a valid XLSX file`);
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    throw new UploadError(`${fileName}: unsupported sheet type. Upload CSV or XLSX.`);
  }
  if (kind === "zip") {
    if (type !== "zip") throw new UploadError(`${fileName} is not a ZIP archive`);
    return "application/zip";
  }
  if (!IMAGE_TYPES.has(type)) throw new UploadError(`${fileName}: unsupported photo type. Upload JPEG, PNG, WebP, GIF or HEIC.`);
  return `image/${type}`;
}

export async function receiveUpload(body: ReadableStream<Uint8Array>, kind: UploadKind, fileName: string, declaredBytes: number | null) {
  const limit = UPLOAD_LIMITS[kind];
  if (declaredBytes !== null && declaredBytes > limit) throw new UploadError(`${fileName} is ${MB(declaredBytes)}, the limit is ${MB(limit)}`, 413);

  const id = newId("up");
  const key = `uploads/${id.slice(3, 5)}/${id}`;
  const hash = createHash("sha256");
  let bytes = 0;
  let head = Buffer.alloc(0);
  let mime: string | null = null;

  const guard = new Transform({
    transform(chunk: Buffer, _enc, done) {
      bytes += chunk.length;
      if (bytes > limit) return done(new UploadError(`${fileName} is over the ${MB(limit)} limit`, 413));
      if (mime === null) {
        head = Buffer.concat([head, chunk]).subarray(0, 4096);
        if (head.length >= 4096 || head.length >= (declaredBytes ?? Infinity)) {
          try {
            mime = checkType(kind, fileName, sniff(head));
          } catch (error) {
            return done(error as Error);
          }
        }
      }
      hash.update(chunk);
      done(null, chunk);
    },
    flush(done) {
      if (mime === null) {
        try {
          mime = checkType(kind, fileName, sniff(head));
        } catch (error) {
          return done(error as Error);
        }
      }
      done();
    },
  });

  try {
    await storage.write(key, Readable.fromWeb(body as unknown as WebReadableStream).pipe(guard));
  } catch (error) {
    await storage.remove(key);
    throw error instanceof UploadError ? error : new UploadError("Upload interrupted, please try again", 400);
  }
  return { id, storageKey: key, bytes, sha256: hash.digest("hex"), mime: mime! };
}
