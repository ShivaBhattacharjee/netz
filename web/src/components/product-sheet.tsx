"use client";

import { AlertTriangle, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { actions } from "@/lib/data/store";
import { formatMoney, formatWeight } from "@/lib/format";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Confidence, ProductStatusLabel, StatusLabel } from "./common";

const fieldLabels: Record<string, string> = {
  title: "Title",
  description_html: "Description",
  category: "Category",
  tags: "Tags",
  "attributes.material": "Material",
  "attributes.color": "Colour",
  "attributes.care": "Care",
  "variants.price": "Prices",
};

export function ProductSheet({ product, onClose }: { product: Product | undefined; onClose: () => void }) {
  const [shown, setShown] = useState(product);
  if (product && product !== shown) setShown(product);
  return (
    <Sheet open={Boolean(product)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">{shown ? <Body product={shown} /> : null}</SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Body({ product }: { product: Product }) {
  const failed = product.status === "failed";
  const fields = Object.entries(product.confidence).sort((a, b) => a[1] - b[1]);
  const translationState = (l: "de" | "fr") => {
    const states = Object.values(product.translations[l]).map((t) => t.state);
    if (states.includes("out_of_date")) return { tone: "warning" as const, label: "Out of date" };
    if (states.includes("missing")) return { tone: "neutral" as const, label: "Not translated" };
    return { tone: "success" as const, label: "Current" };
  };

  return (
    <>
      <SheetHeader className="border-b p-5">
        <span className="text-xs text-muted-foreground">Product</span>
        <SheetTitle className="text-lg leading-snug">{product.title || "Untitled product"}</SheetTitle>
        <SheetDescription className="flex items-center gap-3">
          <ProductStatusLabel status={product.status} />
          <span className="truncate font-mono text-xs">{product.handle}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        {product.review_reason ? (
          <div className={cn("flex gap-2 rounded-lg border px-3 py-2.5 text-sm", failed ? "border-error/30 bg-error/10" : "border-warning/30 bg-warning/10")}>
            <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", failed ? "text-error" : "text-warning")} />
            {product.review_reason}
          </div>
        ) : null}

        {!failed ? (
          <>
            <Section title="Variants">
              <ul className="divide-y rounded-lg border text-sm">
                {product.variants.map((v) => (
                  <li key={v.sku} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate">{Object.values(v.options).join(", ")}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatWeight(v.weight_grams)}</span>
                    <span className={cn("w-20 text-right tabular-nums", v.price_cents === null && "text-warning")}>
                      {v.price_cents === null ? "Missing" : formatMoney(v.price_cents, v.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Confidence, lowest first">
              <ul className="flex flex-col gap-1.5">
                {fields.slice(0, 6).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{fieldLabels[k] ?? k}</span>
                    <Confidence score={v} />
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Claims">
              {product.claims.length ? (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {product.claims.map((c) => (
                    <li key={c.text} className="flex items-center justify-between gap-3">
                      <span>{c.text}</span>
                      <span className="text-xs text-muted-foreground">{c.source}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None found in the source</p>
              )}
            </Section>

            <Section title="Translations">
              <dl className="flex flex-col gap-1.5 text-sm">
                {(["de", "fr"] as const).map((l) => {
                  const s = translationState(l);
                  return (
                    <div key={l} className="flex items-center justify-between">
                      <dt className="text-muted-foreground">{l === "de" ? "German" : "French"}</dt>
                      <dd>
                        <StatusLabel tone={s.tone}>{s.label}</StatusLabel>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Section>

            <Section title="Category">
              <p className="text-sm">{product.category}</p>
            </Section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No AI result was saved for this product. Retry it from its import.</p>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t p-5">
        <Button variant="outline" asChild className={cn(failed || product.status === "approved" ? "ml-auto" : "")}>
          <Link href={`/products/${product.id}`}>
            Open review
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
        {!failed && product.status !== "approved" ? (
          <Button className="ml-auto" onClick={() => actions.approve([product.id])}>
            <Check data-icon="inline-start" />
            Approve
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}
