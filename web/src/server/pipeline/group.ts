import { sha256, stableJson } from "../ids";
import { type Color, normalizeColor } from "./color";
import type { Field, HeaderInfo } from "./headers";
import { type DecimalHint, decimalStyle } from "./number";
import { type Price, parsePrice } from "./price";
import { cleanCell, detectLanguage, htmlToText, sanitizeHtml, slugify } from "./text";
import { parseSize, parseWeight } from "./units";

export const MAX_DESCRIPTION_CHARS = 4000;

export interface CleanRow {
  row: number;
  cells: Record<string, string>;
  hash: string;
  sku: string | null;
  parentSku: string | null;
  title: string;
  descriptionHtml: string;
  descriptionText: string;
  truncated: boolean;
  price: Price | null;
  size: string | null;
  color: Color | null;
  weightGrams: number | null;
  images: string[];
  brand: string | null;
  material: string | null;
  category: string | null;
  notes: string | null;
  language: ReturnType<typeof detectLanguage>;
  repairs: string[];
}

export interface RowOutcome {
  row: number;
  status: "pending" | "done" | "failed";
  reason: string | null;
  groupKey: string | null;
}

export interface VariantInput {
  sku: string;
  sku_derived: boolean;
  options: Record<string, string>;
  price_cents: number | null;
  currency: string;
  weight_grams: number | null;
  source_rows: number[];
}

export interface GroupInput {
  group_key: string;
  source_rows: number[];
  rows: { row: number; cells: Record<string, string> }[];
  variants: VariantInput[];
  attributes: Record<string, string>;
  review_reasons: string[];
  notes: string[];
  languages: string[];
  truncated: boolean;
  photos: { file_name: string; sha256: string; storage_key: string }[];
}

const SIZE_TOKENS = new Set(["XXS", "XS", "S", "M", "L", "XL", "XXL", "SM", "MD", "LG"]);

function fieldValue(raw: string[], header: HeaderInfo, field: Field) {
  const i = header.fields.indexOf(field);
  return i >= 0 ? (raw[i] ?? "") : "";
}

function isVariantToken(segment: string) {
  return /^\d{1,3}([A-Z]{1,3})?$/.test(segment) || SIZE_TOKENS.has(segment) || /^[A-Z]{1,3}$/.test(segment);
}

export function groupKeyForSku(sku: string): string | null {
  const segments = sku.split(/[-_./\s]+/).filter(Boolean);
  let end = segments.length;
  while (end > 2 && isVariantToken(segments[end - 1])) end--;
  return end === segments.length ? null : segments.slice(0, end).join("-");
}

export function sheetDecimalHint(rows: string[][], header: HeaderInfo): DecimalHint {
  let comma = 0;
  let dot = 0;
  for (const raw of rows) {
    const style = decimalStyle(fieldValue(raw, header, "price"));
    if (style === ",") comma++;
    else if (style === ".") dot++;
  }
  return comma > dot ? "," : ".";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function cleanRows(dataRows: { row: number; raw: string[] }[], header: HeaderInfo, defaultCurrency: string, hint: DecimalHint): CleanRow[] {
  return dataRows.map(({ row, raw }) => {
    const repairs: string[] = [];
    const cleaned = header.names.map((name, i) => {
      const { value, repaired } = cleanCell(raw[i]);
      if (repaired) repairs.push(`Encoding repaired in ${name}`);
      return value;
    });
    const get = (field: Field) => fieldValue(cleaned, header, field);

    const rawDescription = get("description");
    const sanitized = sanitizeHtml(rawDescription);
    let descriptionText = htmlToText(sanitized);
    let descriptionHtml = sanitized;
    let truncated = false;
    if (descriptionText.length > MAX_DESCRIPTION_CHARS) {
      descriptionText = `${descriptionText.slice(0, MAX_DESCRIPTION_CHARS)}…`;
      descriptionHtml = `<p>${escapeHtml(descriptionText)}</p>`;
      truncated = true;
      repairs.push(`Description truncated from ${rawDescription.length} characters`);
    }
    if (rawDescription && sanitized !== rawDescription.trim() && /<script|on\w+=|javascript:/i.test(rawDescription)) {
      repairs.push("Unsafe HTML removed from description");
    }

    const cells: Record<string, string> = {};
    header.names.forEach((name, i) => {
      const value = header.fields[i] === "description" ? descriptionHtml : cleaned[i];
      if (value) cells[name] = value;
    });

    const price = parsePrice(get("price"), get("currency").toUpperCase() || defaultCurrency, hint);
    if (price?.currencyDefaulted && price.cents !== null) repairs.push(`No currency on price, ${price.currency} applied`);

    const rawSize = get("size");
    const size = rawSize ? parseSize(rawSize, hint) : null;
    if (size?.normalized && size.label !== rawSize) repairs.push(`Size "${rawSize}" read as ${size.label}`);

    const color = get("color") ? normalizeColor(get("color")) : null;
    if (color?.fixedFrom && color.fixedFrom.toLowerCase() !== color.value) repairs.push(`Colour "${color.fixedFrom}" read as ${color.value}`);

    const rawWeight = get("weight");
    const weightGrams = rawWeight ? parseWeight(rawWeight, hint) : null;
    if (rawWeight && weightGrams === null) repairs.push(`Could not read weight "${rawWeight}"`);

    const sku = get("sku").toUpperCase().replace(/\s+/g, "") || null;
    const title = get("title");
    const images = get("image")
      .split(/[,;|\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const hashSource = header.names.map((_, i) => cleaned[i].replace(/\s+/g, " ").toLowerCase());

    return {
      row,
      cells,
      hash: sha256(stableJson(hashSource)),
      sku,
      parentSku: get("parent_sku").toUpperCase().replace(/\s+/g, "") || null,
      title,
      descriptionHtml,
      descriptionText,
      truncated,
      price,
      size: size?.label ?? null,
      color,
      weightGrams,
      images,
      brand: get("brand") || null,
      material: get("material") || null,
      category: get("category") || null,
      notes: get("notes") || null,
      language: detectLanguage(`${title} ${descriptionText}`),
      repairs,
    };
  });
}

function joinRows(rows: number[]) {
  return rows.length <= 2 ? rows.join(" and ") : `${rows.slice(0, -1).join(", ")} and ${rows.at(-1)}`;
}

function distinct<T>(values: T[]) {
  return [...new Set(values)];
}

export function buildGroups(rows: CleanRow[], defaultCurrency: string): { outcomes: RowOutcome[]; groups: GroupInput[] } {
  const outcomes: RowOutcome[] = [];
  const firstByHash = new Map<string, number>();
  const live: CleanRow[] = [];

  for (const r of rows) {
    const dupOf = firstByHash.get(r.hash);
    if (dupOf !== undefined) {
      outcomes.push({ row: r.row, status: "done", reason: `Duplicate of row ${dupOf}`, groupKey: null });
      continue;
    }
    firstByHash.set(r.hash, r.row);
    if (!r.title && !r.descriptionText) {
      outcomes.push({ row: r.row, status: "failed", reason: "Not enough information to build a product (no title, no description)", groupKey: null });
      continue;
    }
    live.push(r);
  }

  const byKey = new Map<string, CleanRow[]>();
  for (const r of live) {
    const key =
      r.parentSku ?? (r.sku && groupKeyForSku(r.sku)) ?? (r.sku && !r.title ? r.sku : null) ?? `T-${slugify(`${r.title} ${r.brand ?? ""}`, 60).toUpperCase()}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  const groups: GroupInput[] = [];
  for (const [groupKey, members] of byKey) {
    members.sort((a, b) => a.row - b.row);
    const reasons: string[] = [];

    const bySku = new Map<string, CleanRow[]>();
    const derived = new Set<string>();
    for (const r of members) {
      let sku = r.sku;
      if (!sku) {
        sku = `${groupKey.slice(0, 24)}-${r.hash.slice(0, 6).toUpperCase()}`;
        derived.add(sku);
        reasons.push(`No SKU on row ${r.row}, generated ${sku}`);
      }
      const list = bySku.get(sku) ?? [];
      list.push(r);
      bySku.set(sku, list);
    }

    const colors = distinct(members.map((r) => r.color?.value).filter(Boolean));
    const colorsBySize = new Map<string, Set<string>>();
    for (const r of members) {
      if (!r.color) continue;
      const set = colorsBySize.get(r.size ?? "") ?? new Set();
      set.add(r.color.value);
      colorsBySize.set(r.size ?? "", set);
    }
    const hasSizes = members.some((r) => r.size);
    const colorIsOption = colors.length > 1 && (!hasSizes || [...colorsBySize.values()].some((set) => set.size > 1));
    const variants: VariantInput[] = [];
    for (const [sku, skuRows] of bySku) {
      const rowsUsed = skuRows.map((r) => r.row);
      const prices = skuRows.map((r) => r.price).filter((p): p is Price => p !== null);
      const priced = prices.filter((p) => p.cents !== null);
      const distinctPrices = distinct(priced.map((p) => `${p.cents} ${p.currency}`));
      const weights = distinct(skuRows.map((r) => r.weightGrams).filter((w): w is number => w !== null));
      const size = skuRows.find((r) => r.size)?.size ?? null;
      const color = skuRows.find((r) => r.color)?.color?.value ?? null;

      const options: Record<string, string> = {};
      if (size) options.size = size;
      if (color && colorIsOption) options.color = color;
      const label = Object.entries(options)[0]?.join(" ") ?? `SKU ${sku}`;

      let priceCents: number | null = null;
      let currency = priced[0]?.currency ?? prices[0]?.currency ?? "";
      if (distinctPrices.length > 1) {
        const conflicting = skuRows.filter((r) => r.price?.cents !== null && r.price).map((r) => r.row);
        reasons.push(`Two prices for SKU ${sku} (rows ${joinRows(conflicting)})`);
      } else if (priced.length > 0) {
        priceCents = priced[0].cents;
        currency = priced[0].currency;
      } else {
        const unreadable = prices.find((p) => p.error && p.error !== "Price is 0");
        reasons.push(unreadable ? `${unreadable.error} for ${label}` : `No price for ${label}`);
      }

      if (weights.length > 1) reasons.push(`Two weights for SKU ${sku} (${weights.map((w) => `${w} g`).join(" and ")})`);

      variants.push({
        sku,
        sku_derived: derived.has(sku),
        options,
        price_cents: priceCents,
        currency,
        weight_grams: weights.length === 1 ? weights[0] : null,
        source_rows: rowsUsed,
      });
    }

    const currencies = distinct(variants.filter((v) => v.price_cents !== null).map((v) => v.currency));
    if (currencies.length > 1) reasons.push(`Mixed currencies within one product (${joinRows(currencies as never[])})`);
    const fallbackCurrency = currencies[0] ?? variants.find((v) => v.currency)?.currency ?? defaultCurrency;
    for (const v of variants) v.currency ||= fallbackCurrency;

    variants.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }));

    const attributes: Record<string, string> = {};
    if (colors.length > 0 && !colorIsOption) {
      const counts = new Map<string, number>();
      for (const r of members) if (r.color) counts.set(r.color.value, (counts.get(r.color.value) ?? 0) + 1);
      attributes.color = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    }
    const material = members.find((r) => r.material)?.material;
    if (material) attributes.material = material;
    const brand = members.find((r) => r.brand)?.brand;
    if (brand) attributes.brand = brand;

    for (const r of members) outcomes.push({ row: r.row, status: "pending", reason: null, groupKey });

    groups.push({
      group_key: groupKey,
      source_rows: members.map((r) => r.row),
      rows: members.map((r) => ({ row: r.row, cells: r.cells })),
      variants,
      attributes,
      review_reasons: distinct(reasons),
      notes: distinct(members.flatMap((r) => r.repairs.map((x) => `Row ${r.row}: ${x}`))),
      languages: distinct(members.map((r) => r.language).filter((l) => l !== "unknown")),
      truncated: members.some((r) => r.truncated),
      photos: [],
    });
  }

  outcomes.sort((a, b) => a.row - b.row);
  return { outcomes, groups };
}

export function groupInputHash(group: GroupInput) {
  return sha256(
    stableJson({
      rows: group.rows.map((r) => r.cells).map(stableJson).sort(),
      photos: group.photos.map((p) => p.sha256).sort(),
    }),
  );
}
