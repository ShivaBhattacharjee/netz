"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
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
  return options.prompts.map((p) => ({ value: p.name, label: p.custom ? `${p.label} (custom)` : `${p.label} (${p.version})` }));
}

interface PromptDetail {
  name: string;
  source: string;
  version: string;
  system: string;
  user: string;
  custom: boolean;
}

function fetchPrompt(name: string) {
  return api<PromptDetail>(`/api/prompts/${encodeURIComponent(name)}`);
}

export function PromptSource({ name, onDeleted }: { name: string; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<PromptDetail | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!name || loadedFor === name) return;
    fetchPrompt(name)
      .then((p) => {
        setPrompt(p);
        setLoadedFor(name);
      })
      .catch(() => setPrompt(null));
  }, [name, loadedFor]);

  const current = loadedFor === name ? prompt : null;

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <p className="flex flex-wrap items-center gap-x-1">
        <button type="button" className="plain-button underline underline-offset-4 hover:text-foreground" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide prompt" : "Show prompt"}
        </button>
        {current?.custom ? (
          <>
            <span>·</span>
            <button
              type="button"
              className="plain-button text-error underline underline-offset-4"
              onClick={() =>
                void api(`/api/prompts/${encodeURIComponent(name)}`, { method: "DELETE" })
                  .then(() => {
                    toast.success("Prompt deleted");
                    onDeleted?.();
                  })
                  .catch((e: Error) => toast.error(e.message))
              }
            >
              Delete
            </button>
          </>
        ) : null}
      </p>
      {open ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
          {current ? `# System\n${current.system}\n\n# User\n${current.user}` : "Loading…"}
        </pre>
      ) : null}
    </div>
  );
}

export function NewPromptSheet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [system, setSystem] = useState("");
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || system) return;
    fetchPrompt("build-product")
      .then((p) => {
        setSystem(p.system);
        setUser(p.user);
      })
      .catch(() => undefined);
  }, [open, system]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ name: string }>("/api/prompts", { method: "POST", json: { name, system, user } });
      toast.success("Prompt saved");
      onOpenChange(false);
      setName("");
      setSystem("");
      setUser("");
      onCreated(created.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the prompt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">New prompt</SheetTitle>
          <SheetDescription>
            Starts from the built-in prompt. Keep {"{{input}}"} in the user message; the category list is added automatically if you remove {"{{taxonomy}}"}. Output is still
            schema-checked and every claim is verified against the source rows.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt-name">Name</Label>
            <Input id="prompt-name" placeholder="Stricter claims" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt-system">System prompt</Label>
            <Textarea id="prompt-system" rows={16} className="field-sizing-fixed font-mono text-xs" value={system} onChange={(e) => setSystem(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt-user">User message</Label>
            <Textarea id="prompt-user" rows={5} className="field-sizing-fixed font-mono text-xs" value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !system.trim() || !user.includes("{{input}}") || busy} onClick={() => void save()}>
            {busy ? "Saving" : "Save prompt"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function PromptPicker({
  id,
  options,
  value,
  onChange,
  onPromptsChanged,
}: {
  id: string;
  options: EvalOptions;
  value: string;
  onChange: (v: string) => void;
  onPromptsChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <OptionSelect id={id} label="Prompt" value={value} onChange={onChange} options={promptOptions(options)} />
        </div>
        <Button variant="outline" className="h-10 px-4" onClick={() => setCreating(true)}>
          <Plus data-icon="inline-start" />
          New prompt
        </Button>
      </div>
      <PromptSource
        name={value}
        onDeleted={() => {
          onChange(options.prompts[0]?.name ?? "build-product");
          onPromptsChanged();
        }}
      />
      <NewPromptSheet
        open={creating}
        onOpenChange={setCreating}
        onCreated={(name) => {
          onPromptsChanged();
          onChange(name);
        }}
      />
    </div>
  );
}
