import { normalizeForMatch } from "./text";

const VOCABULARY: Record<string, string[]> = {
  white: ["white", "weiss", "weiß", "blanc", "blanche", "offwhite", "off white"],
  black: ["black", "schwarz", "noir", "noire"],
  charcoal: ["charcoal", "anthrazit", "anthracite", "dark grey", "dark gray", "dunkelgrau"],
  grey: ["grey", "gray", "grau", "gris"],
  natural: ["natural", "natur", "naturel", "nature", "naturell"],
  terracotta: ["terracotta", "terrakotta", "terre cuite"],
  green: ["green", "grun", "grün", "gruen", "vert", "verte"],
  sage: ["sage", "salbei", "sauge"],
  olive: ["olive", "oliv"],
  blue: ["blue", "blau", "bleu"],
  navy: ["navy", "marine", "dunkelblau"],
  red: ["red", "rot", "rouge"],
  pink: ["pink", "rosa", "rose"],
  yellow: ["yellow", "gelb", "jaune"],
  ochre: ["ochre", "ocher", "ocker", "ocre"],
  orange: ["orange"],
  brown: ["brown", "braun", "marron"],
  beige: ["beige"],
  cream: ["cream", "creme", "crème", "ecru"],
  sand: ["sand", "sable"],
  gold: ["gold", "or", "doré"],
  silver: ["silver", "silber", "argent"],
  clear: ["clear", "transparent", "klar"],
};

const LOOKUP = new Map<string, string>();
for (const [canonical, words] of Object.entries(VOCABULARY)) {
  for (const word of words) LOOKUP.set(normalizeForMatch(word), canonical);
}

function distance(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export interface Color {
  value: string;
  fixedFrom?: string;
  known: boolean;
}

export function normalizeColor(raw: string): Color | null {
  const key = normalizeForMatch(raw);
  if (!key) return null;
  const exact = LOOKUP.get(key);
  if (exact) return { value: exact, known: true, ...(exact !== key ? { fixedFrom: raw } : {}) };

  let best: { canonical: string; d: number } | null = null;
  for (const [word, canonical] of LOOKUP) {
    if (Math.abs(word.length - key.length) > 2) continue;
    const d = distance(key, word);
    const limit = key.length <= 4 ? 1 : 2;
    if (d <= limit && (!best || d < best.d)) best = { canonical, d };
  }
  if (best) return { value: best.canonical, fixedFrom: raw, known: true };
  return { value: key, known: false };
}
