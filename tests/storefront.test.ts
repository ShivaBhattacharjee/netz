import { describe, expect, it } from "vitest";
import { toCsv, toShopifyCsv } from "@/lib/export";
import { formatMoney } from "@/lib/format";
import { countryFor, localized, localizedAttribute } from "@/lib/locale";
import { product } from "./helpers";

describe("storefront language and prices", () => {
  it.each([
    ["ES", "en"],
    ["AT", "de"],
    ["DE", "de"],
    ["FR", "fr"],
  ])("serves %s in %s (5.3, 5.4)", (code, locale) => {
    expect(countryFor(code).locale).toBe(locale);
  });

  it.each([
    ["de", "1.299,00\u00a0€"],
    ["fr", "1\u202f299,00\u00a0€"],
    ["en", "€1,299.00"],
  ] as const)("formats integer cents for %s (5.6)", (locale, expected) => {
    expect(formatMoney(129900, "EUR", locale)).toBe(expected);
  });

  it("falls back to English per field and per attribute (5.2)", () => {
    const p = product({
      title: "Planter",
      attributes: { care: "Bring indoors below 0 °C", color: "natural" },
      attribute_translations: { de: { care: "Unter 0 °C ins Haus holen" }, fr: {} },
      translations: {
        de: { title: { text: "", origin: "ai", state: "missing" }, description_html: { text: "<p>Topf</p>", origin: "ai", state: "current" } },
        fr: { title: { text: "", origin: "ai", state: "missing" }, description_html: { text: "", origin: "ai", state: "missing" } },
      },
    } as never);
    expect(localized(p, "de", "title")).toBe("Planter");
    expect(localized(p, "de", "description_html")).toBe("<p>Topf</p>");
    expect(localizedAttribute(p, "de", "care")).toBe("Unter 0 °C ins Haus holen");
    expect(localizedAttribute(p, "de", "color")).toBe("natural");
  });
});

describe("exports (1.19)", () => {
  const p = product({ title: "=cmd|' /C calc'!A0", tags: ["+SUM(1+1)"], description_html: "@SUM(A1)" });
  const startsWithFormula = (line: string) => line.split(",").some((cell) => /^"?[=+@-]/.test(cell));

  it("prefixes formula cells in the CSV export", () => {
    const row = toCsv([p]).split("\n")[1];
    expect(row).toContain("'=cmd|");
    expect(startsWithFormula(row)).toBe(false);
  });

  it("prefixes formula cells in the Shopify export", () => {
    const row = toShopifyCsv([p], "Store").split("\n")[1];
    expect(row).toContain("'=cmd|");
    expect(startsWithFormula(row)).toBe(false);
  });
});
