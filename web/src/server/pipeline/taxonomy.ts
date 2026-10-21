export const TAXONOMY = [
  "Home & Garden > Planters",
  "Home & Garden > Vases",
  "Home & Garden > Outdoor Decor",
  "Home > Decor",
  "Home > Decor > Wall Art",
  "Home > Decor > Mirrors",
  "Home > Fragrance > Candles",
  "Home > Fragrance > Diffusers",
  "Home > Textiles > Cushions",
  "Home > Textiles > Throws",
  "Home > Textiles > Rugs",
  "Home > Textiles > Curtains",
  "Home > Textiles > Bedding",
  "Home > Textiles > Towels",
  "Home > Storage > Baskets",
  "Home > Storage > Boxes",
  "Home > Furniture",
  "Kitchen & Dining > Mugs",
  "Kitchen & Dining > Cups & Glasses",
  "Kitchen & Dining > Plates & Bowls",
  "Kitchen & Dining > Serveware",
  "Kitchen & Dining > Cookware",
  "Kitchen & Dining > Table Linen",
  "Lighting > Table Lamps",
  "Lighting > Floor Lamps",
  "Lighting > Pendant Lamps",
  "Lighting > Light Bulbs",
  "Bath > Accessories",
  "Stationery",
  "Other",
] as const;

export type Category = (typeof TAXONOMY)[number];

const SET = new Set<string>(TAXONOMY);

export function isCategory(value: string): value is Category {
  return SET.has(value);
}
