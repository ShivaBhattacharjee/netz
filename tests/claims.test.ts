import { describe, expect, it } from "vitest";
import { finalizeBuild, type BuildOutput } from "@/server/ai/build";
import { evalPath, loadSheet } from "./helpers";

const planter = loadSheet(evalPath("small", "supplier-sheet.csv")).groups.find((g) => g.group_key === "TC-PL")!;

const output: BuildOutput = {
  title: "Hand-thrown Terracotta Planter",
  description_html: "<p>Frost-proof organic planter.</p><script>x()</script>",
  category: "Garden > Things",
  tags: ["planter"],
  attributes: [{ key: "care", value: "Bring indoors below 0 °C", source: "row 4, column Notes" }],
  claims: [
    { text: "frost-resistant", source_row: 4, source_column: "Notes", quote: "frost-resistant" },
    { text: "frost-proof", source_row: 4, source_column: "Notes", quote: "frost-proof" },
    { text: "dishwasher-safe", source_row: 4, source_column: "Notes", quote: "dishwasher safe" },
    { text: "handmade", source_row: 99, source_column: "Notes", quote: "handmade" },
  ],
  seo: { meta_title: "Terracotta Planter", meta_description: "Hand-thrown terracotta planter." },
  confidence: [
    { field: "title", score: 95 },
    { field: "description_html", score: 60 },
  ],
  concerns: [],
};

const built = finalizeBuild(planter, output);

describe("checking model output", () => {
  it("keeps only claims quoted from the cited cell (2.2)", () => {
    expect(built.claims.map((c) => c.text)).toEqual(["frost-resistant"]);
  });

  it("removes a claim the source negates (1.25)", () => {
    expect(built.reviewReasons).toContain('Removed unsupported claim "frost-proof": the source says the opposite (row 4, column Notes)');
  });

  it("removes claims with a missing quote or a row from another product (2.2)", () => {
    expect(built.reviewReasons).toContain('Removed unsupported claim "dishwasher-safe": quote not found in row 4, column Notes');
    expect(built.reviewReasons).toContain('Removed unsupported claim "handmade": cites row 99, column Notes, which is not in this product');
  });

  it("flags risky terms with no source (2.2)", () => {
    expect(built.reviewReasons).toContain('Mentions "organic" with no source');
  });

  it("takes prices and SKUs from the sheet, not the model (2.3)", () => {
    expect(planter.variants.map((v) => [v.sku, v.price_cents])).toEqual([
      ["TC-PL-12", 1450],
      ["TC-PL-20", 2499],
      ["TC-PL-30", null],
    ]);
  });

  it("sends low confidence to review (2.4)", () => {
    expect(built.reviewReasons).toContain("Low confidence on description_html (60%)");
  });

  it("replaces a category outside the taxonomy (2.5)", () => {
    expect(built.category).toBe("Other");
    expect(built.reviewReasons.some((r) => r.startsWith("Category not recognised"))).toBe(true);
  });

  it("sanitises HTML in the output (2.10)", () => {
    expect(built.descriptionHtml).toBe("<p>Frost-proof organic planter.</p>");
  });
});
