import { beforeEach, describe, expect, it, vi } from "vitest";
import { costMicros } from "@/server/ai/pricing";

const generateJson = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/anthropic", async (original) => ({ ...(await original<typeof import("@/server/ai/anthropic")>()), generateJson }));

const { translateFields } = await import("@/server/ai/translate");

describe("cost tracking", () => {
  it("bills cached input at a tenth and cache writes at 1.25x", () => {
    const uncached = costMicros("claude-haiku-5-5", { inputTokens: 10_000, outputTokens: 1_000 });
    const cached = costMicros("claude-haiku-5-5", { inputTokens: 10_000, outputTokens: 1_000, cacheReadTokens: 8_000 });
    const written = costMicros("claude-haiku-5-5", { inputTokens: 10_000, outputTokens: 1_000, cacheWriteTokens: 8_000 });
    expect(uncached).toBe(1_500);
    expect(cached).toBe(2_000 * 0.1 + 8_000 * 0.1 * 0.1 + 1_000 * 0.5);
    expect(written).toBe(2_000 * 0.1 + 8_000 * 0.1 * 1.25 + 1_000 * 0.5);
  });

  it("charges nothing for unknown or mock models", () => {
    expect(costMicros("mock", { inputTokens: 1_000, outputTokens: 1_000 })).toBe(0);
    expect(costMicros("not-a-model", { inputTokens: 1_000, outputTokens: 1_000 })).toBe(0);
  });
});

describe("translating German and French in one call", () => {
  beforeEach(() => generateJson.mockReset());

  it("sends the English once and returns each language with its own fields", async () => {
    generateJson.mockImplementation(async () => ({
      text: JSON.stringify({ de: { title: "Pflanztopf ⟦0⟧", care: "Unter ⟦1⟧ ins Haus holen" }, fr: { title: "Jardinière ⟦0⟧" } }),
      usage: { inputTokens: 500, outputTokens: 120 },
      latencyMs: 10,
    }));

    const result = await translateFields(
      "claude-haiku-5-5",
      { title: "Planter 20 cm", care: "Bring indoors below 0 °C" },
      { de: ["title", "care"], fr: ["title"] },
      [],
    );

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(result.byLocale.de?.fields).toEqual({ title: "Pflanztopf 20 cm", care: "Unter 0 °C ins Haus holen" });
    expect(result.byLocale.fr?.fields).toEqual({ title: "Jardinière 20 cm" });
  });

  it("rejects a field per language when a protected value is lost (5.7)", async () => {
    generateJson.mockImplementation(async () => ({
      text: JSON.stringify({ de: { title: "Pflanztopf" }, fr: { title: "Jardinière ⟦0⟧" } }),
      usage: { inputTokens: 500, outputTokens: 120 },
      latencyMs: 10,
    }));

    const result = await translateFields("claude-haiku-5-5", { title: "Planter 20 cm" }, { de: ["title"], fr: ["title"] }, []);

    expect(result.byLocale.de?.failed).toEqual({ title: "placeholders changed" });
    expect(result.byLocale.fr?.fields).toEqual({ title: "Jardinière 20 cm" });
  });
});
