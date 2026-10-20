import type {
  Claim,
  FieldTranslation,
  ImportJob,
  ImportRow,
  Product,
  ProductStatus,
  ProductTranslations,
  RowStatus,
  SourceRow,
  SeoFields,
  Variant,
} from "../types";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261021);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => Math.round(min + rand() * (max - min));

type Words = { en: string; de: string; fr: string };

const materials: Record<string, Words> = {
  terracotta: { en: "terracotta", de: "Terrakotta", fr: "terre cuite" },
  stoneware: { en: "stoneware", de: "Steinzeug", fr: "grès" },
  concrete: { en: "concrete", de: "Beton", fr: "béton" },
  porcelain: { en: "porcelain", de: "Porzellan", fr: "porcelaine" },
  glass: { en: "glass", de: "Glas", fr: "verre" },
  linen: { en: "linen", de: "Leinen", fr: "lin" },
  cotton: { en: "cotton", de: "Baumwolle", fr: "coton" },
  wool: { en: "wool", de: "Wolle", fr: "laine" },
  "soy wax": { en: "soy wax", de: "Sojawachs", fr: "cire de soja" },
  seagrass: { en: "seagrass", de: "Seegras", fr: "jonc de mer" },
  rattan: { en: "rattan", de: "Rattan", fr: "rotin" },
  ceramic: { en: "ceramic", de: "Keramik", fr: "céramique" },
  "olive wood": { en: "olive wood", de: "Olivenholz", fr: "bois d'olivier" },
};

const colors: Record<string, Words & { typo: string }> = {
  natural: { en: "natural", de: "Natur", fr: "naturel", typo: "natrual" },
  sand: { en: "sand", de: "Sand", fr: "sable", typo: "sandd" },
  charcoal: { en: "charcoal", de: "Anthrazit", fr: "anthracite", typo: "antrazit" },
  sage: { en: "sage", de: "Salbei", fr: "sauge", typo: "salbei" },
  white: { en: "white", de: "Weiß", fr: "blanc", typo: "weiss" },
  ochre: { en: "ochre", de: "Ocker", fr: "ocre", typo: "ocher" },
  rust: { en: "rust", de: "Rost", fr: "rouille", typo: "rost" },
  terracotta: { en: "terracotta", de: "Terrakotta", fr: "terre cuite", typo: "terracota" },
};

interface ProductType {
  noun: Words;
  category: string;
  sizes: string[];
  rawSizes: string[];
  materials: string[];
  colors: string[];
  baseCents: number;
  weights: number[];
  claims: { text: string; note: string }[];
  care: string;
  tags: string[];
}

const productTypes: ProductType[] = [
  {
    noun: { en: "Planter", de: "Pflanztopf", fr: "Jardinière" },
    category: "Home & Garden > Planters",
    sizes: ["12 cm", "20 cm", "30 cm"],
    rawSizes: ["12cm", "7.9 in", "30 cm"],
    materials: ["terracotta", "stoneware", "concrete"],
    colors: ["terracotta", "natural", "charcoal", "sage"],
    baseCents: 1499,
    weights: [600, 1800, 4200],
    claims: [
      { text: "frost-resistant", note: "frost-resistant (not frost-proof, bring indoors below 0 °C)" },
      { text: "drainage hole", note: "with drainage hole" },
    ],
    care: "Bring indoors below 0 °C",
    tags: ["planter", "indoor", "garden"],
  },
  {
    noun: { en: "Mug", de: "Tasse", fr: "Tasse" },
    category: "Kitchen & Dining > Mugs",
    sizes: ["250 ml", "350 ml"],
    rawSizes: ["250ml", "0,35 l"],
    materials: ["stoneware", "porcelain"],
    colors: ["white", "sand", "charcoal", "rust"],
    baseCents: 1299,
    weights: [320, 410],
    claims: [
      { text: "dishwasher-safe", note: "spülmaschinenfest / dishwasher safe" },
      { text: "microwave-safe", note: "microwave ok" },
    ],
    care: "Dishwasher and microwave safe",
    tags: ["mug", "coffee", "tableware"],
  },
  {
    noun: { en: "Vase", de: "Vase", fr: "Vase" },
    category: "Home & Garden > Vases",
    sizes: ["18 cm", "28 cm"],
    rawSizes: ["18cm", "11 inch"],
    materials: ["glass", "stoneware"],
    colors: ["natural", "sage", "ochre", "white"],
    baseCents: 2499,
    weights: [700, 1400],
    claims: [{ text: "handmade", note: "each piece handmade, small variations" }],
    care: "Hand wash only",
    tags: ["vase", "flowers", "decor"],
  },
  {
    noun: { en: "Cushion Cover", de: "Kissenbezug", fr: "Housse de coussin" },
    category: "Home > Textiles > Cushions",
    sizes: ["40 × 40 cm", "50 × 50 cm"],
    rawSizes: ["40x40", "20 x 20 in"],
    materials: ["linen", "cotton"],
    colors: ["natural", "sand", "sage", "rust"],
    baseCents: 2999,
    weights: [180, 240],
    claims: [
      { text: "OEKO-TEX certified", note: "OEKO-TEX Standard 100 cert. no. 21.HUS.12345" },
      { text: "washable at 40 °C", note: "wash 40 deg" },
    ],
    care: "Machine wash at 40 °C",
    tags: ["cushion", "textiles", "living room"],
  },
  {
    noun: { en: "Throw", de: "Plaid", fr: "Plaid" },
    category: "Home > Textiles > Throws",
    sizes: ["130 × 170 cm"],
    rawSizes: ["130x170cm"],
    materials: ["wool", "cotton"],
    colors: ["charcoal", "ochre", "natural"],
    baseCents: 7900,
    weights: [1100],
    claims: [{ text: "organic cotton", note: "GOTS organic cotton" }],
    care: "Dry clean or hand wash cold",
    tags: ["throw", "blanket", "textiles"],
  },
  {
    noun: { en: "Candle", de: "Kerze", fr: "Bougie" },
    category: "Home > Fragrance > Candles",
    sizes: ["180 g", "320 g"],
    rawSizes: ["180g", "11.3 oz"],
    materials: ["soy wax"],
    colors: ["white", "sand"],
    baseCents: 1999,
    weights: [260, 450],
    claims: [{ text: "vegan", note: "vegan, no animal products" }],
    care: "Trim wick to 5 mm before each use",
    tags: ["candle", "scented", "gift"],
  },
  {
    noun: { en: "Basket", de: "Korb", fr: "Panier" },
    category: "Home > Storage > Baskets",
    sizes: ["S", "M", "L"],
    rawSizes: ["small", "M", "Large"],
    materials: ["seagrass", "rattan"],
    colors: ["natural"],
    baseCents: 2299,
    weights: [400, 650, 900],
    claims: [{ text: "handwoven", note: "handwoven in Vietnam" }],
    care: "Wipe with a dry cloth",
    tags: ["basket", "storage"],
  },
  {
    noun: { en: "Table Lamp", de: "Tischleuchte", fr: "Lampe de table" },
    category: "Lighting > Table Lamps",
    sizes: ["32 cm"],
    rawSizes: ["32cm"],
    materials: ["ceramic"],
    colors: ["white", "ochre", "sage"],
    baseCents: 8900,
    weights: [2100],
    claims: [{ text: "E27 bulb", note: "fitting E27, bulb not incl." }],
    care: "Disconnect before cleaning",
    tags: ["lamp", "lighting"],
  },
  {
    noun: { en: "Bowl", de: "Schale", fr: "Bol" },
    category: "Kitchen & Dining > Bowls",
    sizes: ["14 cm", "22 cm"],
    rawSizes: ["14cm", "8.7in"],
    materials: ["stoneware", "olive wood"],
    colors: ["natural", "white", "charcoal"],
    baseCents: 1799,
    weights: [380, 820],
    claims: [{ text: "food-safe", note: "food safe glaze" }],
    care: "Hand wash recommended",
    tags: ["bowl", "tableware", "kitchen"],
  },
];

const lines = ["Alba", "Fjord", "Olea", "Sora", "Mira", "Terra", "Nord", "Lumen", "Cala", "Rhea", "Vela", "Iris"];

const reviewReasons: { reason: string; field: string }[] = [
  { reason: "No price for size {size}", field: "variants.price" },
  { reason: "Two prices for SKU {sku} (rows {a} and {b})", field: "variants.price" },
  { reason: "Category not recognised from supplier text", field: "category" },
  { reason: "Colour '{typo}' could not be matched with confidence", field: "attributes.color" },
  { reason: "Claim 'frost-proof' not supported by source text, removed", field: "claims" },
  { reason: "Care instructions only in German, translation uncertain", field: "attributes.care" },
];

const failReasons = [
  "Model output did not match the schema after 5 attempts",
  "Not enough information to build a product (no title, no description)",
  "Request timed out 5 times",
];

const BASE_TIME = Date.UTC(2026, 9, 20, 8, 0, 0);
const iso = (minutesAfter: number) => new Date(BASE_TIME + minutesAfter * 60_000).toISOString();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function rawPrice(cents: number): string {
  const euros = (cents / 100).toFixed(2);
  const style = pick(["de", "plain", "prefix", "de-thousands"]);
  if (style === "de") return `${euros.replace(".", ",")} €`;
  if (style === "prefix") return `EUR ${euros}`;
  if (style === "de-thousands" && cents >= 100000) {
    return `${Math.floor(cents / 100).toLocaleString("de-DE")},${euros.slice(-2)} €`;
  }
  return cents % 100 === 0 ? String(cents / 100) : euros.replace(/0$/, "");
}

function seoFor(titles: Record<"en" | "de" | "fr", string>, descs: Record<"en" | "de" | "fr", string>): Record<"en" | "de" | "fr", SeoFields> {
  const strip = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const make = (t: string, d: string): SeoFields => ({
    meta_title: `${t} | Atelier Terra`.slice(0, 60),
    meta_description: strip(d).slice(0, 155),
  });
  return { en: make(titles.en, descs.en), de: make(titles.de, descs.de), fr: make(titles.fr, descs.fr) };
}

function ai(text: string): FieldTranslation {
  return { text, origin: "ai", state: "current" };
}

const MODEL_CHEAP = "claude-haiku-5-5";
const MODEL_STRONG = "claude-sonnet-5-5";

export const modelPricing: Record<string, { input: number; output: number }> = {
  [MODEL_CHEAP]: { input: 1, output: 5 },
  [MODEL_STRONG]: { input: 3, output: 15 },
};

function costMicros(model: string, input: number, output: number, batched: boolean): number {
  const p = modelPricing[model];
  const full = input * p.input + output * p.output;
  return Math.round(batched ? full / 2 : full);
}

interface Built {
  product: Product;
  rows: ImportRow[];
}

function buildProduct(index: number, importId: string, firstRow: number, batched: boolean): Built {
  const type = pick(productTypes);
  const line = pick(lines);
  const materialKey = pick(type.materials);
  const material = materials[materialKey];
  const colorKeys = rand() < 0.35 ? [pick(type.colors), pick(type.colors)].filter((c, i, a) => a.indexOf(c) === i) : [pick(type.colors)];
  const sizeCount = Math.min(type.sizes.length, between(1, type.sizes.length));
  const sizeIdx = type.sizes.map((_, i) => i).slice(0, sizeCount);

  const titleEn = `${line} ${material.en.split(" ").map(capitalize).join(" ")} ${type.noun.en}`;
  const handle = slugify(`${titleEn}-${index}`);
  const skuBase = `${line.slice(0, 2).toUpperCase()}-${type.noun.en.replace(/\s/g, "").slice(0, 3).toUpperCase()}-${String(index).padStart(3, "0")}`;

  const roll = rand();
  const status: ProductStatus = roll < 0.55 ? "approved" : roll < 0.78 ? "ready" : roll < 0.95 ? "needs_review" : "failed";

  const variants: Variant[] = [];
  const sources: SourceRow[] = [];
  let row = firstRow;
  const supplierName = rand() < 0.3 ? `${type.noun.de.toUpperCase()} ${line.toUpperCase()} ${material.de}` : `${line} ${type.noun.en.toLowerCase()} ${material.en}`;
  const claimPool = type.claims.filter((c) => !(c.text === "organic cotton" && materialKey !== "cotton"));
  const claimCount = claimPool.length ? between(0, claimPool.length) : 0;
  const chosenClaims = claimPool.slice(0, claimCount);
  const notesRow = firstRow;

  for (const ck of colorKeys) {
    for (const si of sizeIdx) {
      const priceCents = type.baseCents + si * 1000 + (ck === colorKeys[0] ? 0 : 200);
      const sku = `${skuBase}-${type.sizes[si].replace(/[^0-9A-Z]/gi, "").slice(0, 4).toUpperCase()}${colorKeys.length > 1 ? `-${ck.slice(0, 2).toUpperCase()}` : ""}`;
      const options: Record<string, string> = { size: type.sizes[si] };
      if (colorKeys.length > 1) options.color = colors[ck].en;
      variants.push({ sku, options, price_cents: priceCents, currency: "EUR", weight_grams: type.weights[si] });
      const usesTypo = rand() < 0.15;
      const weightRaw = rand() < 0.3 ? `${(type.weights[si] / 453.6).toFixed(1)} lbs` : rand() < 0.5 ? `${type.weights[si] / 1000} kg` : `${type.weights[si]}g`;
      sources.push({
        row,
        cells: {
          SKU: sku,
          Name: supplierName,
          Size: type.rawSizes[si],
          Colour: usesTypo ? colors[ck].typo : colors[ck].en,
          Price: rawPrice(priceCents),
          Weight: weightRaw,
          Notes: row === notesRow ? chosenClaims.map((c) => c.note).join("; ") : "",
          Description:
            row === notesRow
              ? `<p>${capitalize(material.en)} ${type.noun.en.toLowerCase()}${rand() < 0.2 ? '<script>track()</script>' : ""}</p>`
              : "",
        },
      });
      row += 1;
    }
  }

  const claims: Claim[] = chosenClaims.map((c) => ({ text: c.text, source: `row ${notesRow}, column Notes` }));

  const confidence: Record<string, number> = {
    title: between(88, 99),
    description_html: between(80, 97),
    category: between(76, 98),
    tags: between(78, 96),
    "attributes.material": between(85, 99),
    "attributes.color": between(74, 98),
    "attributes.care": between(70, 95),
  };

  let reviewReason: string | null = null;
  if (status === "needs_review") {
    const r = pick(reviewReasons);
    const v = variants[variants.length - 1];
    reviewReason = r.reason
      .replace("{size}", v.options.size)
      .replace("{sku}", v.sku)
      .replace("{a}", String(firstRow))
      .replace("{b}", String(firstRow + 212))
      .replace("{typo}", colors[colorKeys[0]].typo);
    confidence[r.field] = between(38, 66);
    if (r.reason.startsWith("No price")) {
      v.price_cents = null;
      sources[sources.length - 1].cells.Price = "";
    }
  }

  const descEn =
    `<p>The ${line} ${type.noun.en.toLowerCase()} in ${material.en}, finished in ${colors[colorKeys[0]].en}.</p>` +
    (claims.length ? `<p>${capitalize(claims.map((c) => c.text).join(", "))}.</p>` : "");
  const descDe = `<p>${type.noun.de} ${line} aus ${material.de}, in ${colors[colorKeys[0]].de}.</p>`;
  const descFr = `<p>${type.noun.fr} ${line} en ${material.fr}, coloris ${colors[colorKeys[0]].fr}.</p>`;

  const translations: ProductTranslations = {
    de: { title: ai(`${line} ${type.noun.de} aus ${material.de}`), description_html: ai(descDe) },
    fr: { title: ai(`${type.noun.fr} ${line} en ${material.fr}`), description_html: ai(descFr) },
  };
  const manualFields: string[] = [];
  if (status === "needs_review" || status === "failed") {
    translations.de.title.state = "missing";
    translations.de.description_html.state = "missing";
    translations.fr.title.state = "missing";
    translations.fr.description_html.state = "missing";
  } else if (rand() < 0.08) {
    translations.de.title = { text: translations.de.title.text, origin: "manual", state: "out_of_date" };
    manualFields.push("translations.de.title");
  } else if (rand() < 0.05) {
    translations.fr.description_html.state = "missing";
  }

  const messy = sources.some((s) => /lbs|oz|\bin(ch)?\b/.test(`${s.cells.Size} ${s.cells.Weight}`)) || status === "needs_review";
  const photos = rand() < 0.8 ? [`${skuBase}_front.jpg`, ...(rand() < 0.5 ? [`${skuBase}_detail.jpg`] : [])] : [];
  const model = messy && photos.length ? MODEL_STRONG : MODEL_CHEAP;
  const inputTokens = between(900, 2400) + (model === MODEL_STRONG ? 1200 : 0);
  const outputTokens = between(350, 700);

  const failed = status === "failed";
  const product: Product = {
    id: `prd_${String(index).padStart(4, "0")}`,
    store_id: "st_atelier",
    import_id: importId,
    title: failed ? supplierName : titleEn,
    handle,
    description_html: failed ? "" : descEn,
    category: failed ? "" : type.category,
    tags: failed ? [] : [materialKey, ...type.tags],
    attributes: failed
      ? {}
      : { material: material.en, ...(colorKeys.length === 1 ? { color: colors[colorKeys[0]].en } : {}), care: type.care },
    variants,
    claims: failed ? [] : claims,
    confidence: failed ? {} : confidence,
    status,
    review_reason: failed ? pick(failReasons) : reviewReason,
    source_rows: sources.map((s) => s.row),
    sources,
    photos,
    translations,
    seo: seoFor(
      { en: titleEn, de: translations.de.title.text, fr: translations.fr.title.text },
      { en: descEn, de: descDe, fr: descFr },
    ),
    manual_fields: manualFields,
    usage: {
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_micros: costMicros(model, inputTokens, outputTokens, batched),
      latency_ms: between(800, 2600) + (model === MODEL_STRONG ? 2200 : 0) + (status === "failed" ? 18000 : 0),
    },
    updated_at: iso(index * 3),
  };

  const rowStatus: RowStatus = status === "failed" ? "failed" : status === "needs_review" ? "needs_review" : "done";
  const rows: ImportRow[] = sources.map((s) => ({
    row: s.row,
    sku: s.cells.SKU,
    title: s.cells.Name,
    status: rowStatus,
    product_id: product.id,
    reason: product.review_reason,
  }));
  return { product, rows };
}

function terracottaShowcase(): Built {
  const sources: SourceRow[] = [
    {
      row: 14,
      cells: {
        SKU: "TC-PL-20",
        Name: "Pflanztopf Terracota handgedreht",
        Size: "20cm",
        Colour: "terracota",
        Price: "24,99 €",
        Weight: "1,8 kg",
        Notes: "frost-resistant (not frost-proof, bring indoors below 0 °C); Abzugsloch",
        Description: '<p onclick="x()">Handgedrehter Topf aus Terrakotta mit Abzugsloch.</p><script>alert(1)</script>',
      },
    },
    {
      row: 15,
      cells: {
        SKU: "TC-PL-30",
        Name: "Pflanztopf Terracota handgedreht",
        Size: "11.8 in",
        Colour: "terracotta",
        Price: "",
        Weight: "7.3 lbs",
        Notes: "",
        Description: "",
      },
    },
    {
      row: 212,
      cells: {
        SKU: "TC-PL-12",
        Name: "Terracotta planter hand thrown",
        Size: "12 cm",
        Colour: "Natural",
        Price: "14.5",
        Weight: "600g",
        Notes: "",
        Description: "",
      },
    },
  ];
  const product: Product = {
    id: "prd_0000",
    store_id: "st_atelier",
    import_id: "imp_spring",
    title: "Hand-thrown Terracotta Planter",
    handle: "hand-thrown-terracotta-planter",
    description_html:
      "<p>Hand-thrown terracotta planter with drainage hole.</p><p>Frost-resistant, not frost-proof: bring indoors below 0 °C.</p>",
    category: "Home & Garden > Planters",
    tags: ["terracotta", "planter", "indoor"],
    attributes: { material: "terracotta", color: "natural", care: "Bring indoors below 0 °C" },
    variants: [
      { sku: "TC-PL-12", options: { size: "12 cm" }, price_cents: 1450, currency: "EUR", weight_grams: 600 },
      { sku: "TC-PL-20", options: { size: "20 cm" }, price_cents: 2499, currency: "EUR", weight_grams: 1800 },
      { sku: "TC-PL-30", options: { size: "30 cm" }, price_cents: null, currency: "EUR", weight_grams: 3311 },
    ],
    claims: [
      { text: "frost-resistant", source: "row 14, column Notes" },
      { text: "drainage hole", source: "row 14, column Description" },
      { text: "hand-thrown", source: "row 14, column Name" },
    ],
    confidence: {
      title: 97,
      description_html: 92,
      category: 81,
      tags: 90,
      "attributes.material": 98,
      "attributes.color": 72,
      "attributes.care": 64,
      "variants.price": 41,
    },
    status: "needs_review",
    review_reason: "No price for size 30 cm",
    source_rows: [14, 15, 212],
    sources,
    photos: ["TC-PL-20_front.jpg", "TC-PL-20_top.jpg", "TC-PL-12.jpg"],
    translations: {
      de: {
        title: { text: "Handgedrehter Pflanztopf aus Terrakotta", origin: "manual", state: "out_of_date" },
        description_html: ai(
          "<p>Handgedrehter Pflanztopf aus Terrakotta mit Abzugsloch.</p><p>Frostbeständig, nicht frostfest: unter 0 °C ins Haus holen.</p>",
        ),
      },
      fr: {
        title: ai("Jardinière en terre cuite tournée à la main"),
        description_html: ai(
          "<p>Jardinière en terre cuite tournée à la main, avec trou de drainage.</p><p>Résistante au gel, mais pas ingélive : à rentrer en dessous de 0 °C.</p>",
        ),
      },
    },
    seo: {
      en: { meta_title: "Hand-thrown Terracotta Planter | Atelier Terra", meta_description: "Hand-thrown terracotta planter with drainage hole. Frost-resistant, not frost-proof: bring indoors below 0 °C." },
      de: { meta_title: "Handgedrehter Pflanztopf aus Terrakotta | Atelier Terra", meta_description: "Handgedrehter Pflanztopf aus Terrakotta mit Abzugsloch. Frostbeständig, nicht frostfest." },
      fr: { meta_title: "Jardinière en terre cuite tournée main | Atelier Terra", meta_description: "Jardinière en terre cuite tournée à la main, avec trou de drainage. Résistante au gel, pas ingélive." },
    },
    manual_fields: ["translations.de.title"],
    usage: { model: MODEL_STRONG, input_tokens: 3410, output_tokens: 620, cost_micros: costMicros(MODEL_STRONG, 3410, 620, false), latency_ms: 4300 },
    updated_at: iso(1),
  };
  const rows: ImportRow[] = sources.map((s) => ({
    row: s.row,
    sku: s.cells.SKU,
    title: s.cells.Name,
    status: "needs_review",
    product_id: product.id,
    reason: product.review_reason,
  }));
  return { product, rows };
}

function buildImport(
  id: string,
  count: number,
  startIndex: number,
  batched: boolean,
  firstRow = 2,
): { products: Product[]; rows: ImportRow[] } {
  const products: Product[] = [];
  const rows: ImportRow[] = [];
  let nextRow = firstRow;
  for (let i = 0; i < count; i++) {
    const built = buildProduct(startIndex + i, id, nextRow, batched);
    products.push(built.product);
    rows.push(...built.rows);
    nextRow += built.rows.length;
    if (rand() < 0.06) {
      const dup = built.rows[0];
      rows.push({ row: nextRow, sku: dup.sku, title: dup.title, status: "done", product_id: dup.product_id, reason: `Duplicate of row ${dup.row}` });
      nextRow += 1;
    }
  }
  return { products, rows };
}

const showcase = terracottaShowcase();
const spring = buildImport("imp_spring", 120, 1, false, 216);
const restock = buildImport("imp_restock", 48, 121, false);

export const seedProducts: Product[] = [showcase.product, ...spring.products, ...restock.products];

const springRows = [...showcase.rows, ...spring.rows].sort((a, b) => a.row - b.row);
const restockRows = restock.rows;

function countRows(rows: ImportRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { pending: 0, done: 0, needs_review: 0, failed: 0 },
  );
}

const sum = (products: Product[]) => products.reduce((acc, p) => acc + p.usage.cost_micros, 0);

export const seedImports: ImportJob[] = [
  {
    id: "imp_lager",
    store_id: "st_atelier",
    file_name: "lagerliste_q4_2026.xlsx",
    file_bytes: 4_812_000,
    photo_count: 1840,
    total_rows: 10_000,
    counts: { pending: 6380, done: 3104, needs_review: 412, failed: 104 },
    status: "processing",
    resume_in_seconds: null,
    error: null,
    created_at: iso(600),
    unmatched_photos: ["IMG_0001.jpg", "IMG_0002.jpg", "scan_final_v2.jpg"],
    cost_micros: 6_420_000,
  },
  {
    id: "imp_maison",
    store_id: "st_maison",
    file_name: "maison-deco-fr.csv",
    file_bytes: 812_000,
    photo_count: 0,
    total_rows: 1800,
    counts: { pending: 1046, done: 690, needs_review: 52, failed: 12 },
    status: "paused",
    resume_in_seconds: 420,
    error: "Rate limit reached on claude-haiku-5-5",
    created_at: iso(580),
    unmatched_photos: [],
    cost_micros: 1_204_000,
  },
  {
    id: "imp_spring",
    store_id: "st_atelier",
    file_name: "spring-supplier-2026.xlsx",
    file_bytes: 386_000,
    photo_count: 214,
    total_rows: springRows.length,
    counts: countRows(springRows),
    status: "completed",
    resume_in_seconds: null,
    error: null,
    created_at: iso(0),
    unmatched_photos: ["DSC_4410.jpg", "planter-old.png"],
    cost_micros: sum([showcase.product, ...spring.products]),
  },
  {
    id: "imp_restock",
    store_id: "st_atelier",
    file_name: "terracotta-restock.csv",
    file_bytes: 41_000,
    photo_count: 60,
    total_rows: restockRows.length,
    counts: countRows(restockRows),
    status: "completed",
    resume_in_seconds: null,
    error: null,
    created_at: iso(240),
    unmatched_photos: [],
    cost_micros: sum(restock.products),
  },
  {
    id: "imp_broken",
    store_id: "st_atelier",
    file_name: "supplier-feed-final.xlsx",
    file_bytes: 1_204_000,
    photo_count: 0,
    total_rows: 0,
    counts: { pending: 0, done: 0, needs_review: 0, failed: 0 },
    status: "failed",
    resume_in_seconds: null,
    error: "Could not read the file: the workbook is password protected",
    created_at: iso(560),
    unmatched_photos: [],
    cost_micros: 0,
  },
];

export const seedImportRows: Record<string, ImportRow[]> = {
  imp_spring: springRows,
  imp_restock: restockRows,
};

export const costHistory: {
  day: string;
  cost_micros: number;
  saved_micros: number;
  products: number;
  done: number;
  review: number;
  failed: number;
}[] = Array.from({ length: 14 }, (_, i) => {
  const products = between(120, 900) + (i === 13 ? 2600 : 0);
  const cost = products * between(1800, 2600);
  const failed = Math.round(products * (0.02 + rand() * 0.03));
  const review = Math.round(products * (0.1 + rand() * 0.08));
  return {
    day: new Date(BASE_TIME - (13 - i) * 86_400_000).toISOString().slice(0, 10),
    cost_micros: cost,
    saved_micros: Math.round(cost * (1.6 + rand() * 0.6)),
    products,
    done: products - failed - review,
    review,
    failed,
  };
});
