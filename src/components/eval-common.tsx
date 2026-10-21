"use client";

import { MoreHorizontal, Play, Plus, RotateCcw, Square, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

const MAX_SAMPLE = 10_000;
const CUSTOM = "custom";

const SAMPLE_SIZES = [
  { value: "25", label: "25 products" },
  { value: "100", label: "100 products" },
  { value: "500", label: "500 products" },
  { value: String(MAX_SAMPLE), label: "All products" },
  { value: CUSTOM, label: "Custom…" },
];

export function isValidSampleSize(value: string) {
  const n = Number(value);
  return /^\d+$/.test(value) && n >= 1 && n <= MAX_SAMPLE;
}

export function SampleSizeSelect({ id, label, value, onChange, available }: { id: string; label: string; value: string; onChange: (v: string) => void; available?: number }) {
  const [custom, setCustom] = useState(() => !SAMPLE_SIZES.some((o) => o.value === value));
  useEffect(() => setCustom(!SAMPLE_SIZES.some((o) => o.value === value)), [value]);
  const max = Math.min(available ?? MAX_SAMPLE, MAX_SAMPLE);
  const invalid = custom && !isValidSampleSize(value);

  return (
    <div className="flex flex-col gap-2">
      <OptionSelect
        id={id}
        label={label}
        value={custom ? CUSTOM : value}
        onChange={(v) => {
          setCustom(v === CUSTOM);
          if (v !== CUSTOM) onChange(v);
        }}
        options={SAMPLE_SIZES}
      />
      {custom ? (
        <>
          <Input
            id={`${id}-custom`}
            aria-label={`${label}, custom number`}
            inputMode="numeric"
            placeholder={`1 to ${formatNumber(max)}`}
            value={value}
            aria-invalid={invalid || undefined}
            autoFocus
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
          {invalid ? (
            <p className="text-xs text-error">Enter a whole number from 1 to {formatNumber(MAX_SAMPLE)}.</p>
          ) : available !== undefined && Number(value) > available ? (
            <p className="text-xs text-muted-foreground">This set has {formatNumber(available)} products, so all of them are used.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

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
  const label = {
    queued: "Queued",
    running: `Running ${formatNumber(run.done)}/${formatNumber(run.total)}`,
    failed: run.error === "Stopped" ? "Stopped" : "Failed",
    completed: "Completed",
  }[run.status];
  const tone = run.status === "failed" && run.error === "Stopped" ? "neutral" : ({ queued: "neutral", running: "info", failed: "error", completed: "success" } as const)[run.status];
  const color = {
    success: "border-success/30 bg-success/10",
    error: "border-error/30 bg-error/10",
    info: "border-info/30 bg-info/10",
    neutral: "border-border bg-muted/30",
  }[tone];
  return <span className={cn("inline-flex self-start items-center border px-1.5 py-0.5 text-xs", color)}><StatusLabel tone={tone}>{label}</StatusLabel></span>;
}

export function RunActions({ run, onChanged, onDeleted, onRetry }: { run: EvalRun; onChanged: () => void; onDeleted?: () => void; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const action = run.status === "queued" || run.status === "running" ? "stop" : run.status === "failed" ? "retry" : null;

  async function act(action: "stop" | "delete") {
    setBusy(true);
    try {
      await api(`/api/evals/${run.id}${action === "delete" ? "" : `/${action}`}`, { method: action === "delete" ? "DELETE" : "POST" });
      toast.success(action === "stop" ? "Evaluation stopped" : "Evaluation deleted");
      setConfirmDelete(false);
      onChanged();
      if (action === "delete") onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not ${action === "delete" ? "delete" : action} the evaluation`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${run.label}`} disabled={busy} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {action ? (
            <DropdownMenuItem onSelect={() => action === "retry" ? onRetry() : void act("stop")}>
              {action === "stop" ? <Square /> : <RotateCcw />}
              {action === "stop" ? "Stop run" : "Retry run"}
            </DropdownMenuItem>
          ) : null}
          {action ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete run
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this evaluation?</AlertDialogTitle>
            <AlertDialogDescription>This removes the run and its results permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-error text-background hover:bg-error/85" disabled={busy} onClick={(e) => { e.preventDefault(); void act("delete"); }}>Delete run</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
        <SelectTrigger id={id} className="w-full min-w-0 overflow-hidden">
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
  return options.sets.map((s) => ({ value: s.id, label: `${s.name} · ${formatNumber(s.products)} products` }));
}

export function RunSetupSheet({
  options,
  open,
  onOpenChange,
  onStarted,
  onPromptsChanged,
  initialRun,
}: {
  options: EvalOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: () => void;
  onPromptsChanged: () => void;
  initialRun?: EvalRun | null;
}) {
  const [picked, setSet] = useState(options.sets[0]?.id ?? "");
  const [model, setModel] = useState(options.models[0]?.id ?? "");
  const [prompt, setPrompt] = useState(options.prompts[0]?.name ?? "build-product");
  const [limit, setLimit] = useState("25");
  const [busy, setBusy] = useState(false);
  const set = options.sets.some((s) => s.id === picked) ? picked : (options.sets[0]?.id ?? "");

  useEffect(() => {
    if (!open) return;
    setSet(options.sets.find((s) => s.name === initialRun?.set)?.id ?? options.sets[0]?.id ?? "");
    setModel(options.models.some((m) => m.id === initialRun?.model) ? initialRun!.model : (options.models[0]?.id ?? ""));
    setPrompt(options.prompts.some((p) => p.name === initialRun?.prompt) ? initialRun!.prompt : (options.prompts[0]?.name ?? "build-product"));
    setLimit(String(initialRun?.sample_limit ?? 25));
  // Reset when the sheet opens or a different run is selected; polling must not overwrite edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRun?.id]);

  async function start() {
    setBusy(true);
    try {
      await api("/api/evals", { method: "POST", json: { set, model, prompt, limit: Number(limit) } });
      toast.success("Evaluation started");
      onOpenChange(false);
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the evaluation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">{initialRun ? "Retry evaluation" : "Run evaluation"}</SheetTitle>
          <SheetDescription>
            {initialRun ? "Review or change the settings, then start a new evaluation run." : "Runs the real pipeline on a labelled set and scores every field against the labels. AI calls are billed."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          <OptionSelect id="eval-set" label="Labelled set" value={set} onChange={setSet} options={setOptions(options)} />
          <OptionSelect id="eval-model" label="Model" value={model} onChange={setModel} options={modelOptions(options)} />
          <PromptPicker id="eval-prompt" options={options} value={prompt} onChange={setPrompt} onPromptsChanged={onPromptsChanged} />
          <SampleSizeSelect id="eval-limit" label="Products to build" value={limit} onChange={setLimit} available={options.sets.find((s) => s.id === set)?.products} />
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!set || !model || !isValidSampleSize(limit) || busy} onClick={() => void start()}>
            <Play data-icon="inline-start" />
            {busy ? "Starting" : initialRun ? "Retry evaluation" : "Start evaluation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
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

export function PromptSource({ name, onDeleted, actions }: { name: string; onDeleted?: () => void; actions?: ReactNode }) {
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
        {actions ? (
          <>
            <span>·</span>
            {actions}
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
      <OptionSelect id={id} label="Prompt" value={value} onChange={onChange} options={promptOptions(options)} />
      <PromptSource
        name={value}
        onDeleted={() => {
          onChange(options.prompts[0]?.name ?? "build-product");
          onPromptsChanged();
        }}
        actions={
          <button type="button" className="plain-button inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground" onClick={() => setCreating(true)}>
            <Plus className="size-3" />
            New prompt
          </button>
        }
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
