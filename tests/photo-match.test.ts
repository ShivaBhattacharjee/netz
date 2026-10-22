import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/server/env";
import { evalPath } from "./helpers";

const generateJson = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/anthropic", async (original) => ({ ...(await original<typeof import("@/server/ai/anthropic")>()), generateJson }));

const { MAX_CANDIDATES, catalogText, matchPhoto, shortlist } = await import("@/server/ai/match-photo");

const candidates = [
  { groupKey: "TC-PL", title: "Hand-thrown Terracotta Planter", skus: ["TC-PL-12", "TC-PL-20"], options: ["size 12 cm", "size 20 cm"], details: ["material terracotta"] },
  { groupKey: "MG-ST", title: "Stoneware Mug", skus: ["MG-ST-350-WH"], options: ["color white"], details: [] },
];
const file = { fileName: "IMG_0001.jpg", storageKey: "tests/match-photo.jpg" };
const reply = (body: unknown) => generateJson.mockResolvedValue({ text: JSON.stringify(body), usage: { inputTokens: 1_200, outputTokens: 40 }, latencyMs: 5 });

describe("AI photo matching", () => {
  beforeAll(() => {
    const dir = path.join(env().STORAGE_DIR, "tests");
    mkdirSync(dir, { recursive: true });
    copyFileSync(evalPath("small", "photos", "IMG_0001.jpg"), path.join(dir, "match-photo.jpg"));
  });
  beforeEach(() => generateJson.mockReset());

  it("lists each product once with an ID, title, SKUs and options", () => {
    expect(catalogText(candidates)).toBe(
      "P1 | Hand-thrown Terracotta Planter | material terracotta | SKUs: TC-PL-12, TC-PL-20 | options: size 12 cm, size 20 cm\nP2 | Stoneware Mug | SKUs: MG-ST-350-WH | options: color white",
    );
  });

  it("maps the catalog ID back to the group and sends the photo with the call", async () => {
    reply({ match: "P2", confidence: 91.4, reason: "White stoneware mug with a handle" });
    const result = await matchPhoto(file, candidates, "claude-haiku-5-5");
    expect(result).toMatchObject({ groupKey: "MG-ST", confidence: 91, reason: "White stoneware mug with a handle" });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toMatchObject({ task: "match", ok: true });
    const request = generateJson.mock.calls[0][0];
    expect(request.system).toContain("P1 | Hand-thrown Terracotta Planter");
    expect(request.content.some((part: { type: string }) => part.type === "image")).toBe(true);
  });

  it("returns no match for null or an ID outside the catalog", async () => {
    reply({ match: null, confidence: 40, reason: "Two similar planters" });
    expect(await matchPhoto(file, candidates, "claude-haiku-5-5")).toMatchObject({ groupKey: null, confidence: 0 });
    reply({ match: "P9", confidence: 95, reason: "Made up" });
    expect(await matchPhoto(file, candidates, "claude-haiku-5-5")).toMatchObject({ groupKey: null, confidence: 0 });
  });

  it("treats output that breaks the schema as retryable and keeps the spend", async () => {
    reply({ match: "P1" });
    await expect(matchPhoto(file, candidates, "claude-haiku-5-5")).rejects.toMatchObject({ kind: "invalid_output", calls: [{ ok: true }] });
  });

  it("caps the catalog and puts products sharing words with the file name first", () => {
    const many = Array.from({ length: MAX_CANDIDATES + 50 }, (_, i) => ({ groupKey: `G${i}`, title: `Item ${i}`, skus: [], options: [], details: [] }));
    many.push({ groupKey: "VASE", title: "Ribbed Glass Vase", skus: [], options: [], details: [] });
    const picked = shortlist(many, "ribbed-vase-front.jpg");
    expect(picked).toHaveLength(MAX_CANDIDATES);
    expect(picked.map((c) => c.groupKey)).toContain("VASE");
    expect(shortlist(candidates, "IMG_0001.jpg")).toBe(candidates);
  });
});
