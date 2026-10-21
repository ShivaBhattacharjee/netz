import type { GroupInput } from "../pipeline/group";
import { htmlToText } from "../pipeline/text";
import type { BuildOutput } from "./build";

const CATEGORY_HINTS: [RegExp, string][] = [
  [/planter|pflanz|topf|pot\b/i, "Home & Garden > Planters"],
  [/vase/i, "Home & Garden > Vases"],
  [/mug|tasse|becher/i, "Kitchen & Dining > Mugs"],
  [/candle|kerze|bougie/i, "Home > Fragrance > Candles"],
  [/cushion|kissen|coussin/i, "Home > Textiles > Cushions"],
  [/throw|plaid|decke/i, "Home > Textiles > Throws"],
  [/basket|korb|panier/i, "Home > Storage > Baskets"],
  [/lamp|leuchte|lampe/i, "Lighting > Table Lamps"],
];

export function mockBuild(group: GroupInput, reason = "Built without AI"): BuildOutput {
  const cellsOf = (pattern: RegExp) =>
    group.rows.flatMap((r) => Object.entries(r.cells).filter(([k]) => pattern.test(k)).map(([, v]) => v));
  const title = cellsOf(/title|name|bezeichnung|nom|product/i)[0] ?? group.group_key;
  const description = cellsOf(/desc|beschreib|body/i)[0] ?? "";
  const text = `${title} ${htmlToText(description)}`;
  const category = CATEGORY_HINTS.find(([re]) => re.test(text))?.[1] ?? "Other";

  return {
    title,
    description_html: description || `<p>${title}</p>`,
    category,
    tags: [],
    attributes: [],
    claims: [],
    seo: { meta_title: title.slice(0, 60), meta_description: htmlToText(description).slice(0, 155) },
    confidence: [
      { field: "title", score: 50 },
      { field: "description_html", score: description ? 50 : 10 },
      { field: "category", score: category === "Other" ? 10 : 60 },
    ],
    concerns: [reason],
  };
}
