"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export function lastDays(days: number): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

export function DateRangeButton({ value, onChange }: { value: { from: Date; to: Date }; onChange: (range: { from: Date; to: Date }) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label="Date range">
          <CalendarDays data-icon="inline-start" />
          {fmt(value.from)} – {fmt(value.to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex flex-col gap-3 sm:flex-row">
        <ul className="flex gap-1 sm:flex-col">
          {PRESETS.map((p) => (
            <li key={p.days}>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  onChange(lastDays(p.days));
                  setOpen(false);
                }}
              >
                {p.label}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          <Calendar mode="range" numberOfMonths={2} selected={draft} onSelect={setDraft} disabled={{ after: new Date() }} defaultMonth={draft?.from} />
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (draft?.from && draft.to) onChange({ from: draft.from, to: draft.to });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
