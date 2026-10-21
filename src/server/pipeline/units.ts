import { type DecimalHint, toNumber } from "./number";

const NUM = String.raw`(\d+(?:[.,]\d+)*)`;

const WEIGHT_UNITS: [RegExp, number][] = [
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms|kilogramm)$/, 1000],
  [/^(g|gr|grs|gram|grams|gramm|grammes?)$/, 1],
  [/^(lb|lbs|pound|pounds)$/, 453.59237],
  [/^(oz|ounce|ounces)$/, 28.349523125],
];

export function parseWeight(raw: string, hint: DecimalHint = "."): number | null {
  const m = raw.trim().toLowerCase().match(new RegExp(`^${NUM}\\s*([a-z.]*)$`));
  if (!m) return null;
  const value = toNumber(m[1], hint);
  if (value === null) return null;
  const unit = m[2].replace(/\.$/, "");
  if (!unit) return Number.isInteger(value) && value >= 30 ? value : null;
  for (const [pattern, factor] of WEIGHT_UNITS) {
    if (pattern.test(unit)) return Math.round(value * factor);
  }
  return null;
}

function snapConverted(value: number, step: number) {
  const snapped = Math.round(value / step) * step;
  return snapped > 0 && Math.abs(value - snapped) / value <= 0.02 ? snapped : Math.round(value);
}

const LENGTH: Record<string, { factor: number; imperial: boolean }> = {
  mm: { factor: 0.1, imperial: false },
  cm: { factor: 1, imperial: false },
  m: { factor: 100, imperial: false },
  in: { factor: 2.54, imperial: true },
  inch: { factor: 2.54, imperial: true },
  inches: { factor: 2.54, imperial: true },
  zoll: { factor: 2.54, imperial: true },
  '"': { factor: 2.54, imperial: true },
  ft: { factor: 30.48, imperial: true },
};

const VOLUME: Record<string, { factor: number; imperial: boolean }> = {
  ml: { factor: 1, imperial: false },
  cl: { factor: 10, imperial: false },
  dl: { factor: 100, imperial: false },
  l: { factor: 1000, imperial: false },
  ltr: { factor: 1000, imperial: false },
  "fl oz": { factor: 29.5735, imperial: true },
  floz: { factor: 29.5735, imperial: true },
};

const LETTER_SIZES: Record<string, string> = {
  xxs: "XXS", xs: "XS", "extra small": "XS", s: "S", sm: "S", small: "S", klein: "S", petit: "S",
  m: "M", md: "M", med: "M", medium: "M", mittel: "M", moyen: "M",
  l: "L", lg: "L", large: "L", gross: "L", groß: "L", grand: "L",
  xl: "XL", "extra large": "XL", xxl: "XXL",
};

function roundestWithin(low: number, high: number, target: number) {
  for (const step of [5, 2, 1]) {
    let best: number | null = null;
    for (let v = Math.ceil(low / step) * step; v <= high; v += step) {
      if (best === null || Math.abs(v - target) < Math.abs(best - target)) best = v;
    }
    if (best !== null) return best;
  }
  return Math.round(target);
}

function toCm(raw: string, value: number, unit: string) {
  const u = LENGTH[unit];
  const cm = value * u.factor;
  if (!u.imperial) return Math.round(cm * 10) / 10;
  const decimals = raw.split(/[.,]/)[1]?.length ?? 0;
  const halfStep = (0.5 / 10 ** decimals) * u.factor;
  return roundestWithin(cm - halfStep, cm + halfStep, cm);
}

function fmt(n: number) {
  return String(n).replace(/\.0$/, "");
}

export interface Size {
  label: string;
  normalized: boolean;
}

export function parseSize(raw: string, hint: DecimalHint = "."): Size | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  if (LETTER_SIZES[s]) return { label: LETTER_SIZES[s], normalized: true };

  const lengthUnits = Object.keys(LENGTH)
    .sort((a, b) => b.length - a.length)
    .map((u) => u.replace(/"/, '"'))
    .join("|");

  const dims = s.match(new RegExp(`^${NUM}\\s*(${lengthUnits})?\\s*[x×*]\\s*${NUM}\\s*(${lengthUnits})?(?:\\s*[x×*]\\s*${NUM}\\s*(${lengthUnits})?)?$`));
  if (dims) {
    const unit = dims[6] || dims[4] || dims[2] || "cm";
    const raws = [dims[1], dims[3], dims[5]].filter((v): v is string => !!v);
    const values = raws.map((v) => toNumber(v, hint));
    if (values.every((v) => v !== null)) {
      return { label: `${values.map((v, i) => fmt(toCm(raws[i], v!, unit))).join(" × ")} cm`, normalized: true };
    }
  }

  const length = s.match(new RegExp(`^${NUM}\\s*(${lengthUnits})$`));
  if (length) {
    const value = toNumber(length[1], hint);
    if (value !== null) return { label: `${fmt(toCm(length[1], value, length[2]))} cm`, normalized: true };
  }

  const volume = s.match(new RegExp(`^${NUM}\\s*(fl\\.? ?oz|ml|cl|dl|ltr|l)$`));
  if (volume) {
    const value = toNumber(volume[1], hint);
    const unit = volume[2].replace(/\.\s?|\s/g, (m) => (m.trim() === "." ? "" : " ")).replace("fl oz", "fl oz");
    const u = VOLUME[unit] ?? VOLUME[unit.replace(/\s/g, "")];
    if (value !== null && u) {
      const ml = value * u.factor;
      return { label: `${u.imperial ? snapConverted(ml, 10) : Math.round(ml)} ml`, normalized: true };
    }
  }

  const grams = parseWeight(s, hint);
  if (grams !== null && /[a-z]/.test(s)) return { label: `${snapConverted(grams, 10)} g`, normalized: true };

  return { label: raw.trim(), normalized: false };
}
