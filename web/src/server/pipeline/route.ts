import type { GroupInput } from "./group";

export function chooseRoute(group: GroupInput): { route: "cheap" | "strong"; reasons: string[] } {
  const reasons: string[] = [];
  const text = group.rows.map((r) => Object.values(r.cells).join(" ")).join(" ");
  const hasDescription = group.rows.some((r) => Object.keys(r.cells).some((k) => /desc|beschreib|body/i.test(k)));

  if (group.languages.some((l) => l !== "en")) reasons.push("Source text is not English");
  if (group.review_reasons.some((r) => r.startsWith("Two "))) reasons.push("Conflicting rows");
  if (!hasDescription && group.photos.length > 0) reasons.push("No description, photos needed");
  if (/\b(not|nicht|kein|keine|ne pas|non)\b/i.test(text)) reasons.push("Qualified or negated claims");
  if (group.truncated) reasons.push("Very long description");
  if (group.variants.length > 12) reasons.push("Many variants");

  return { route: reasons.length > 0 ? "strong" : "cheap", reasons };
}
