import type { Locale } from "./types";

const intlLocale: Record<Locale, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR" };

export function formatMoney(cents: number, currency: string, locale: Locale = "en"): string {
  return new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency }).format(cents / 100);
}

export function formatUsd(micros: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(micros / 1_000_000);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatPercent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatWeight(grams: number | null): string {
  if (grams === null) return "Not set";
  return grams >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`;
}

export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function confidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

export function minConfidence(confidence: Record<string, number>): number {
  const values = Object.values(confidence);
  return values.length ? Math.min(...values) : 0;
}
