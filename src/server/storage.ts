import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOT = path.resolve(process.env.STORAGE_DIR ?? ".data/uploads");

function resolve(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error(`Storage key escapes the storage root: ${key}`);
  return full;
}

export const storage = {
  async write(key: string, source: Readable) {
    const full = resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await pipeline(source, createWriteStream(full));
  },
  async writeBuffer(key: string, data: Buffer) {
    const full = resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await pipeline(
      (async function* () {
        yield data;
      })(),
      createWriteStream(full),
    );
  },
  read(key: string) {
    return readFile(resolve(key));
  },
  stream(key: string) {
    return createReadStream(resolve(key));
  },
  path(key: string) {
    return resolve(key);
  },
  async size(key: string) {
    return (await stat(resolve(key))).size;
  },
  async remove(key: string) {
    await rm(resolve(key), { force: true });
  },
};
