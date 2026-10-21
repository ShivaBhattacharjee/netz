"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/data/api";
import { formatNumber } from "@/lib/format";
import type { EvalOptions, EvalRun } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusLabel } from "./common";

export const FIELD_LABELS: Record<string, string> = {
  grouping: "Grouping",
  "variants.sku": "SKUs",
  "variants.price_cents": "Prices",
  "variants.currency": "Currency",
  "variants.weight_grams": "Weights",
  "variants.options": "Options",
  category: "Category",
  status: "Review decision",
  "claims.recall": "Claims found",
};

export const AI_FIELDS = ["category", "status", "claims.recall"];

export const SAMPLE_SIZES = [
  { value: "25", label: "25 products" },
  { value: "100", label: "100 products" },
  { value: "500", label: "500 products" },
  { value: "10000", label: "All products" },
];

export function fieldLabel(field: string) {
  return FIELD_LABELS[field] ?? (field.startsWith("attributes.") ? `Attribute: ${field.slice(11)}` : field);
}

export function accuracy(score: { correct: number; total: number } | undefined) {
  return score && score.total ? (score.correct / score.total) * 100 : null;
}

export function overallAccuracy(run: EvalRun, fields?: string[]) {
  const entries = Object.entries(run.scores).filter(([k]) => !fields || fields.includes(k) || (fields.includes("attributes") && k.startsWith("attributes.")));
  const correct = entries.reduce((a, [, s]) => a + s.correct, 0);
  const total = entries.reduce((a, [, s]) => a + s.total, 0);
  return total ? (correct / total) * 100 : null;
}

export function pct(value: number | null) {
  return value === null ? "–" : `${value.toFixed(1)}%`;
}

export function RunStatus({ run }: { run: EvalRun }) {
  if (run.status === "completed") return <StatusLabel tone="success">Completed</StatusLabel>;
  if (run.status === "failed") return <StatusLabel tone="error">Failed</StatusLabel>;
  if (run.status === "queued") return <StatusLabel tone="neutral">Queued</StatusLabel>;
  return (
    <StatusLabel tone="info">
      Running {formatNumber(run.done)}/{formatNumber(run.total)}
    </StatusLabel>
  );
}

export function AccuracyBar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", value === null ? "" : value >= 95 ? "bg-success" : value >= 80 ? "bg-chart-2" : "bg-warning")}
        style={{ width: `${value ?? 0}%` }}
      />
    </div>
  );
}

export function OptionSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function setOptions(options: EvalOptions) {
  return options.sets.map((s) => ({ value: s.name, label: `${s.name} · ${formatNumber(s.products)} products` }));
}

export function modelOptions(options: EvalOptions) {
  return options.models.map((m) => ({ value: m.id, label: m.label }));
}

export function promptOptions(options: EvalOptions) {
  return options.prompts.map((p) => ({ value: p.name, label: `${p.name} (${p.version})` }));
}

export function PromptSource({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<{ file: string; version: string; system: string; user: string } | null>(null);

  useEffect(() => {
    if (!open || prompt?.file === `prompts/${name}.md`) return;
    api<{ file: string; version: string; system: string; user: string }>(`/api/prompts/${name}`)
      .then(setPrompt)
      .catch(() => setPrompt(null));
  }, [open, name, prompt?.file]);

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <p>
        Loaded from <span className="font-mono text-foreground">web/prompts/{name}.md</span>. The version in its front matter is saved with every result.{" "}
        <button type="button" className="plain-button underline underline-offset-4 hover:text-foreground" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide prompt" : "Show prompt"}
        </button>
      </p>
      {open ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
          {prompt ? `# System\n${prompt.system}\n\n# User\n${prompt.user}` : "Loading…"}
        </pre>
      ) : null}
    </div>
  );
}
