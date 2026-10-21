import { describe, expect, it } from "vitest";
import { loadCsv, reviewReasons } from "./helpers";

const skus = (group: { variants: { sku: string }[] }) => group.variants.map((v) => v.sku);

describe("grouping rows into products", () => {
  it("strips size and colour segments from SKUs (1.12)", () => {
    const { groups } = loadCsv("SKU,Title,Price\nTC-PL-20,Terracotta Planter,24.99\nTC-PL-30,Terracotta Planter,34.99\n");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ group_key: "TC-PL" });
  });

  it("keeps sequential item numbers apart when the titles differ (1.26)", () => {
    const { groups } = loadCsv(
      "SKU,Title,Price\nHG-PLT-001,Oak Table Lamp,49.00\nHG-PLT-002,Wool Throw Blanket,79.00\nHG-PLT-003,Oak Table Lamp,52.00\n",
    );
    expect(groups.map(skus).sort()).toEqual([["HG-PLT-001", "HG-PLT-003"], ["HG-PLT-002"]]);
  });

  it("sends a shared SKU prefix with unrelated titles to review (1.26)", () => {
    const { groups } = loadCsv("SKU,Title,Price\nTC-PL-20,Terracotta Planter,24.99\nTC-PL-30,Wool Throw Blanket,34.99\n");
    expect(reviewReasons(groups)).toContain(
      'Rows 2 and 3 share SKU prefix TC-PL but have unrelated titles ("Terracotta Planter", "Wool Throw Blanket"); check they are one product',
    );
  });

  it("does not apply the default currency to an unsupported one (1.27)", () => {
    const { groups } = loadCsv("SKU,Title,Price\nJP-1,Tea Bowl,¥1200\nIN-1,Wool Rug,₹ 499\n");
    expect(groups.flatMap((g) => g.variants).every((v) => v.price_cents === null)).toBe(true);
    expect(reviewReasons(groups).filter((r) => r.startsWith("Unsupported currency"))).toHaveLength(2);
  });
});
