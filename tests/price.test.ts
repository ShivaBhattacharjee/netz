import { describe, expect, it } from "vitest";
import { parsePrice } from "@/server/pipeline/price";

describe("parsePrice", () => {
  it.each([
    ["1.299,00 €", 129900, "EUR"],
    ["12.5", 1250, "EUR"],
    ["£8", 800, "GBP"],
    ["EUR 9", 900, "EUR"],
    ["9,-", 900, "EUR"],
    ["CA$ 12", 1200, "CAD"],
    ["A$5", 500, "AUD"],
    ["NZ$9", 900, "NZD"],
    ["$4", 400, "USD"],
  ])("reads %s as %i cents %s (1.7)", (raw, cents, currency) => {
    expect(parsePrice(raw, "EUR")).toMatchObject({ cents, currency });
  });

  it.each(["¥1200", "1200 JPY", "₹ 499"])("refuses the unsupported currency in %s (1.27)", (raw) => {
    const price = parsePrice(raw, "EUR");
    expect(price?.cents).toBeNull();
    expect(price?.error).toMatch(/^Unsupported currency/);
  });

  it("applies the sheet default when no currency is given (1.9)", () => {
    expect(parsePrice("12.50", "GBP")).toMatchObject({ cents: 1250, currency: "GBP", currencyDefaulted: true });
  });
});
