"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { Locale, Variant } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VariantPicker({
  variants,
  locale,
  strings,
}: {
  variants: Variant[];
  locale: Locale;
  strings: Record<string, string>;
}) {
  const firstAvailable = variants.findIndex((v) => v.price_cents !== null);
  const [index, setIndex] = useState(Math.max(0, firstAvailable));
  const selected = variants[index];
  const available = selected.price_cents !== null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xl font-semibold tabular-nums">
        {available ? formatMoney(selected.price_cents!, selected.currency, locale) : strings.unavailable}
      </p>
      {variants.length > 1 ? (
        <div role="radiogroup" aria-label="Variant" className="flex flex-wrap gap-2">
          {variants.map((v, i) => {
            const disabled = v.price_cents === null;
            return (
              <Button
                key={v.sku}
                role="radio"
                aria-checked={i === index}
                variant="outline"
                disabled={disabled}
                onClick={() => setIndex(i)}
                className={cn(i === index && "border-foreground", disabled && "line-through")}
              >
                {Object.values(v.options).join(", ")}
              </Button>
            );
          })}
        </div>
      ) : null}
      <Button size="lg" disabled={!available} className="w-full sm:w-auto sm:px-6">
        {available ? strings.addToCart : strings.unavailable}
      </Button>
    </div>
  );
}
