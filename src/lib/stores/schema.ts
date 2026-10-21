import { z } from "zod";

export const CURRENCIES = ["EUR", "GBP", "USD", "CHF"] as const;

const hostname = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function toHostname(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return raw;
  }
}

export const createStoreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Store name needs at least 2 characters")
    .max(60, "Store name can be at most 60 characters"),
  domain: z
    .string()
    .max(253)
    .transform(toHostname)
    .refine((v) => v === null || hostname.test(v), "Enter a domain like mystore.com"),
  currency: z.enum(CURRENCIES, { message: "Pick a currency" }),
});

export type CreateStoreInput = z.input<typeof createStoreSchema>;
