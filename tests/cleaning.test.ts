import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectHeader } from "@/server/pipeline/headers";
import { chooseRoute } from "@/server/pipeline/route";
import { parseSheet } from "@/server/pipeline/sheet";
import { evalPath, loadRows, loadSheet, reviewReasons } from "./helpers";

const small = loadSheet(evalPath("small", "supplier-sheet.csv"));
const medium = loadSheet(evalPath("medium", "supplier-sheet.csv"));
const repairs = [...small.cleaned, ...medium.cleaned].flatMap((r) => r.repairs);

describe("supplier sheet cleaning", () => {
  it("finds a German header below the first row and reads CSV and XLSX the same (1.6)", () => {
    const xlsx = loadSheet(evalPath("small", "supplier-sheet.xlsx"), "xlsx");
    expect(small.header.index).toBe(2);
    expect(small.header.names).toEqual(expect.arrayContaining(["Artikelnr", "Bezeichnung", "Preis", "Farbe"]));
    expect(xlsx.groups.map((g) => g.group_key).sort()).toEqual(small.groups.map((g) => g.group_key).sort());
  });

  it("decodes Windows-1252 and repairs mojibake (1.5)", () => {
    const cp = loadSheet(evalPath("edge", "semicolon-cp1252.csv"));
    expect(cp.sheet.encoding).toBe("windows-1252");
    expect(cp.cleaned[0].cells.Notes).toContain("0 °C");
    const repaired = small.cleaned.find((r) => r.repairs.includes("Encoding repaired in Farbe"));
    expect(repaired?.color?.value).toBe("green");
  });

  it("flags a variant with no price instead of inventing one (1.8)", () => {
    expect(reviewReasons(small.groups)).toContain("No price for size 30 cm");
  });

  it("normalises sizes to cm (1.10)", () => {
    expect(repairs).toContain('Size "11.8 in" read as 30 cm');
  });

  it("fixes colour typos and records the fix (1.11)", () => {
    expect(repairs).toEqual(expect.arrayContaining(['Colour "terracota" read as terracotta', 'Colour "antrazit" read as charcoal', 'Colour "natrual" read as natural']));
  });

  it("groups one product split across rows (1.12)", () => {
    const planter = small.groups.find((g) => g.group_key === "TC-PL");
    expect(planter?.variants.map((v) => v.sku).sort()).toEqual(["TC-PL-12", "TC-PL-20", "TC-PL-30"]);
  });

  it("collapses exact duplicates and still counts the row (1.13)", () => {
    expect(small.outcomes.find((o) => o.row === 9)).toMatchObject({ status: "done", reason: "Duplicate of row 8" });
  });

  it("does not merge two prices for one SKU (1.14)", () => {
    expect(reviewReasons(small.groups)).toContain("Two prices for SKU VS-GL-18 (rows 11 and 13)");
  });

  it("groups the same way when rows are out of order (1.15)", () => {
    const rows = parseSheet(readFileSync(evalPath("small", "supplier-sheet.csv")), "csv").rows;
    const headerIndex = detectHeader(rows)!.index;
    const reversed = loadRows([...rows.slice(0, headerIndex + 1), ...rows.slice(headerIndex + 1).reverse()]);
    const signature = (groups: typeof small.groups) => groups.map((g) => `${g.group_key}:${g.variants.map((v) => v.sku).sort()}`).sort();
    expect(signature(reversed.groups)).toEqual(signature(small.groups));
  });

  it("fails a row with no title and no description (1.16)", () => {
    expect(small.outcomes.find((o) => o.row === 23)).toMatchObject({ status: "failed", reason: expect.stringContaining("Not enough information") });
  });

  it("truncates a huge description and routes it to the strong model (1.17)", () => {
    const [group] = loadSheet(evalPath("edge", "huge-description.csv")).groups;
    expect(group.truncated).toBe(true);
    expect(group.notes.some((n) => n.includes("Description truncated from"))).toBe(true);
    expect(chooseRoute(group).route).toBe("strong");
  });
});
