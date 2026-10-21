import type { Product } from "./types";

const csvColumns = [
  "handle",
  "title",
  "status",
  "category",
  "tags",
  "sku",
  "options",
  "price_cents",
  "currency",
  "weight_grams",
  "description_html",
  "claims",
  "review_reason",
  "source_rows",
] as const;

function csvCell(value: string | number | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(products: Product[]): string {
  const lines = [csvColumns.join(",")];
  for (const p of products) {
    for (const v of p.variants) {
      const record: Record<(typeof csvColumns)[number], string | number | null> = {
        handle: p.handle,
        title: p.title,
        status: p.status,
        category: p.category,
        tags: p.tags.join("; "),
        sku: v.sku,
        options: Object.entries(v.options)
          .map(([k, val]) => `${k}: ${val}`)
          .join("; "),
        price_cents: v.price_cents,
        currency: v.currency,
        weight_grams: v.weight_grams,
        description_html: p.description_html,
        claims: p.claims.map((c) => `${c.text} (${c.source})`).join("; "),
        review_reason: p.review_reason,
        source_rows: p.source_rows.join(" "),
      };
      lines.push(csvColumns.map((c) => csvCell(record[c])).join(","));
    }
  }
  return lines.join("\n");
}

export function toJson(products: Product[]): string {
  return JSON.stringify(
    products.map((p) => ({
      title: p.title,
      handle: p.handle,
      description_html: p.description_html,
      category: p.category,
      tags: p.tags,
      attributes: p.attributes,
      variants: p.variants,
      claims: p.claims,
      confidence: p.confidence,
      status: p.status,
      review_reason: p.review_reason,
      source_rows: p.source_rows,
      translations: p.translations,
      attribute_translations: p.attribute_translations,
    })),
    null,
    2,
  );
}

const shopifyColumns = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Policy",
  "Variant Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Weight Unit",
  "Image Src",
  "SEO Title",
  "SEO Description",
  "Status",
] as const;

export function toShopifyCsv(products: Product[], vendor: string): string {
  const lines = [shopifyColumns.join(",")];
  for (const p of products) {
    const optionNames = Object.keys(p.variants[0]?.options ?? {});
    p.variants.forEach((v, i) => {
      const first = i === 0;
      const record: Record<(typeof shopifyColumns)[number], string | number | null> = {
        Handle: p.handle,
        Title: first ? p.title : "",
        "Body (HTML)": first ? p.description_html : "",
        Vendor: first ? vendor : "",
        "Product Category": first ? p.category : "",
        Type: first ? (p.category.split(" > ").pop() ?? "") : "",
        Tags: first ? p.tags.join(", ") : "",
        Published: first ? (p.status === "approved" ? "TRUE" : "FALSE") : "",
        "Option1 Name": first ? (optionNames[0] ? optionNames[0][0].toUpperCase() + optionNames[0].slice(1) : "Title") : "",
        "Option1 Value": optionNames[0] ? v.options[optionNames[0]] : "Default Title",
        "Option2 Name": first && optionNames[1] ? optionNames[1][0].toUpperCase() + optionNames[1].slice(1) : "",
        "Option2 Value": optionNames[1] ? v.options[optionNames[1]] : "",
        "Variant SKU": v.sku,
        "Variant Grams": v.weight_grams,
        "Variant Inventory Policy": "deny",
        "Variant Price": v.price_cents === null ? null : (v.price_cents / 100).toFixed(2),
        "Variant Requires Shipping": "TRUE",
        "Variant Taxable": "TRUE",
        "Variant Weight Unit": "g",
        "Image Src": first ? (p.photos[0] ?? "") : "",
        "SEO Title": first ? p.seo.en.meta_title : "",
        "SEO Description": first ? p.seo.en.meta_description : "",
        Status: first ? (p.status === "approved" ? "active" : "draft") : "",
      };
      lines.push(shopifyColumns.map((c) => csvCell(record[c])).join(","));
    });
  }
  return lines.join("\n");
}

export function download(filename: string, content: string, type: string) {
  const bom = type === "text/csv" ? "\uFEFF" : "";
  const url = URL.createObjectURL(new Blob([bom + content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
