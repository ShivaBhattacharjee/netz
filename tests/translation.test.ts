import { describe, expect, it } from "vitest";
import { checkTranslation, maskFields, unmask } from "@/server/ai/translate";

const source = "<p>Keramik Müller planter, 20 cm, 1.8 kg, washable at 40 °C, E27, {{count}} left</p>";
const { masked, tokens } = maskFields({ description: source }, ["Keramik Müller"]);

describe("protecting text during translation (5.7)", () => {
  it("replaces brands, placeholders and measurements with tokens", () => {
    expect(masked.description).not.toMatch(/Keramik Müller|20 cm|1\.8 kg|40 °C|E27|\{\{count\}\}/);
  });

  it("restores them with a decimal comma for German", () => {
    const german = masked.description.replace("planter", "Pflanztopf").replace("left", "übrig");
    expect(checkTranslation(masked.description, german, [])).toBeNull();
    expect(unmask(german, tokens, "de")).toBe("<p>Keramik Müller Pflanztopf, 20 cm, 1,8 kg, washable at 40 °C, E27, {{count}} übrig</p>");
  });

  it("rejects a translation that drops a token", () => {
    expect(checkTranslation(masked.description, masked.description.replace("⟦0⟧", ""), [])).toBe("placeholders changed");
  });

  it("rejects a translation that changes a number", () => {
    expect(checkTranslation("<p>20 x</p>", "<p>25 x</p>", [])).toBe("numbers changed");
  });
});
