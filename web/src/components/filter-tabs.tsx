"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FilterTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function badge(n: number) {
  return n >= 1000 ? compact.format(n) : formatNumber(n);
}

export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "text-background" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`pill-${id}`}
                className="absolute inset-0 rounded-full bg-foreground"
                transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
              />
            ) : null}
            <span className="relative">{t.label}</span>
            {t.count !== undefined ? (
              <span
                className={cn(
                  "relative min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums",
                  active ? "bg-background/15 text-background" : "border border-border text-foreground",
                )}
              >
                {badge(t.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
