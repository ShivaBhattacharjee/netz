import Papa from "papaparse";
import * as XLSX from "xlsx";
import { decodeText } from "./text";

export class SheetError extends Error {}

export interface ParsedSheet {
  rows: string[][];
  encoding: string;
  delimiter?: string;
}

export function parseSheet(buffer: Buffer, kind: "csv" | "xlsx"): ParsedSheet {
  return kind === "xlsx" ? parseXlsx(buffer) : parseCsv(buffer);
}

function parseCsv(buffer: Buffer): ParsedSheet {
  const { text, encoding } = decodeText(buffer);
  const result = Papa.parse<string[]>(text, { delimiter: "", skipEmptyLines: false });
  const fatal = result.errors.find((e) => e.type === "Quotes" || e.code === "UndetectableDelimiter");
  if (fatal && fatal.type === "Quotes") {
    throw new SheetError(`Could not read the file: ${fatal.message} (row ${(fatal.row ?? 0) + 1})`);
  }
  return { rows: result.data.map((r) => r.map((c) => String(c ?? ""))), encoding, delimiter: result.meta.delimiter };
}

function parseXlsx(buffer: Buffer): ParsedSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", dense: true, cellFormula: false, cellHTML: false, sheetRows: 10_100 });
  } catch (error) {
    throw new SheetError(`Could not read the file: ${(error as Error).message}`);
  }
  const first = workbook.SheetNames[0];
  if (!first) throw new SheetError("Could not read the file: the workbook has no sheets");
  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[first], { header: 1, raw: false, defval: "", blankrows: true });
  return { rows: rows.map((r) => r.map((c) => String(c ?? ""))), encoding: "xlsx" };
}
