import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { env } from "@/server/env";
import { extractZip, processPhotos } from "@/server/pipeline/photos";
import { parseSheet } from "@/server/pipeline/sheet";
import { sniff } from "@/server/pipeline/sniff";
import { sanitizeHtml } from "@/server/pipeline/text";
import { evalPath, loadSheet } from "./helpers";

async function collect<T>(items: AsyncIterable<T>) {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

async function* folder(dir: string) {
  for (const fileName of readdirSync(dir)) yield { fileName, data: readFileSync(path.join(dir, fileName)) };
}

describe("uploaded files", () => {
  beforeAll(() => {
    const dir = path.join(env().STORAGE_DIR, "tests");
    mkdirSync(dir, { recursive: true });
    copyFileSync(evalPath("edge", "zip-with-junk.zip"), path.join(dir, "junk.zip"));
    copyFileSync(evalPath("edge", "zip-bomb-lite.zip"), path.join(dir, "bomb.zip"));
  });

  it("detects a PDF renamed to .csv from its bytes (1.1)", () => {
    expect(sniff(readFileSync(evalPath("edge", "renamed-pdf.csv")).subarray(0, 32))).toBe("pdf");
  });

  it("counts every data row so the 10,000 limit can be enforced (1.3)", () => {
    expect(loadSheet(evalPath("edge", "too-many-rows.csv")).dataRows).toHaveLength(10_050);
    expect(loadSheet(evalPath("edge", "exactly-10000-rows.csv")).dataRows).toHaveLength(10_000);
  });

  it("reports a truncated CSV as unreadable (1.4)", () => {
    expect(() => parseSheet(readFileSync(evalPath("edge", "truncated-quotes.csv")), "csv")).toThrow(/^Could not read the file/);
  });

  it("stops a ZIP bomb (1.4)", async () => {
    await expect(collect(extractZip("tests/bomb.zip"))).rejects.toThrow(/Photo archive rejected/);
  });

  it("skips ZIP entries that escape the target folder and system junk (7.8)", async () => {
    const entries = await collect(extractZip("tests/junk.zip"));
    expect(entries.filter((e) => "fileName" in e).map((e) => (e as { fileName: string }).fileName)).toEqual(["TC-PL-20_front.jpg"]);
    expect(entries).toContainEqual({ skipped: "../escape.jpg", reason: "Unsafe path in archive" });
  });

  it("strips scripts, handlers, styles and javascript: links from HTML (1.18)", () => {
    const html = sanitizeHtml(
      `<p style="color:red" onerror="x()">Hi <a href="javascript:alert(1)">x</a> <a href="https://ok.example">ok</a><img src=x onerror=alert(1)><script>alert(1)</script></p>`,
    );
    expect(html).toBe('<p>Hi <a>x</a> <a href="https://ok.example">ok</a></p>');
  });
});

describe("photo matching", async () => {
  const small = loadSheet(evalPath("small", "supplier-sheet.csv"));
  const explicit = new Map<string, string>();
  for (const row of small.cleaned) {
    const groupKey = small.outcomes.find((o) => o.row === row.row)?.groupKey;
    if (groupKey) for (const name of row.images) explicit.set(name.toLowerCase(), groupKey);
  }
  const photos = await processPhotos(folder(evalPath("small", "photos")), small.groups, explicit);
  const photo = (name: string) => photos.find((p) => p.fileName === name);

  it("matches photos named after a SKU", () => {
    expect(photo("TC-PL-20_front.jpg")).toMatchObject({ status: "matched", groupKey: "TC-PL" });
  });

  it("leaves a photo with no matching row unmatched (1.20)", () => {
    expect(photo("DSC_4410.jpg")?.status).toBe("unmatched");
  });

  it("does not guess for a generic filename (1.22)", () => {
    expect(photo("IMG_0001.jpg")?.status).toBe("unmatched");
  });

  it("deduplicates the same image under another name (1.23)", () => {
    expect(photo("TC-PL-20_copy.jpg")).toMatchObject({ status: "duplicate", reason: "Same image as TC-PL-20_front.jpg" });
  });

  it("marks files that are not images as invalid (2.15)", () => {
    expect(photo("broken.jpg")).toMatchObject({ status: "invalid", reason: "Not a valid image" });
    expect(photo("notes.txt")).toMatchObject({ status: "invalid", reason: "Unsupported type" });
  });
});
