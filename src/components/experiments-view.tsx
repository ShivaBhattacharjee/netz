"use client";

import { FlaskConical, Plus, Trophy, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/data/api";
import { formatDateTime, formatDuration, formatNumber, formatUsd } from "@/lib/format";
import type { EvalOptions, EvalRun, Experiment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, Panel } from "./common";
import { EmptyState } from "./empty-state";
import { UploadEvalSet } from "./eval-sets";
import {
  OptionSelect,
  PromptPicker,
  RunActions,
  RunStatus,
  SampleSizeSelect,
  accuracy,
  fieldLabel,
  isValidSampleSize,
  modelOptions,
  overallAccuracy,
  pct,
  setOptions,
} from "./eval-common";
import { PageLoader } from "./page-loader";

interface Variant {
  model: string;
  prompt: string;
}

function NewExperiment({
  options,
  open,
  onOpenChange,
  onStarted,
  onPromptsChanged,
}: {
  options: EvalOptions;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStarted: () => void;
  onPromptsChanged: () => void;
}) {
  const firstPrompt = options.prompts[0]?.name ?? "build-product";
  const [name, setName] = useState("");
  const [picked, setSet] = useState(options.sets[0]?.id ?? "");
  const set = options.sets.some((s) => s.id === picked) ? picked : (options.sets[0]?.id ?? "");
  const [limit, setLimit] = useState("25");
  const [a, setA] = useState<Variant>({ model: "claude-haiku-5-5", prompt: firstPrompt });
  const [b, setB] = useState<Variant>({ model: "claude-sonnet-5-5", prompt: firstPrompt });
  const [busy, setBusy] = useState(false);
  const same = a.model === b.model && a.prompt === b.prompt;

  async function start() {
    setBusy(true);
    try {
      await api("/api/experiments", { method: "POST", json: { name, set, limit: Number(limit), a, b } });
      toast.success("Experiment started");
      onOpenChange(false);
      setName("");
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the experiment");
    } finally {
      setBusy(false);
    }
  }

  const variantFields = (key: "A" | "B", value: Variant, set: (v: Variant) => void) => (
    <fieldset className="flex min-w-0 flex-col gap-3 border p-3">
      <legend className="px-1 text-sm font-medium">Variant {key}</legend>
      <OptionSelect id={`exp-${key}-model`} label="Model" value={value.model} onChange={(model) => set({ ...value, model })} options={modelOptions(options)} />
      <PromptPicker id={`exp-${key}-prompt`} options={options} value={value.prompt} onChange={(prompt) => set({ ...value, prompt })} onPromptsChanged={onPromptsChanged} />
    </fieldset>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl xl:max-w-4xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">New experiment</SheetTitle>
          <SheetDescription>Both variants build the same products from a labelled set, so the comparison is fair. AI calls are billed.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="exp-name">Name</Label>
            <Input id="exp-name" placeholder="Haiku vs Sonnet on messy rows" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <OptionSelect id="exp-set" label="Labelled set" value={set} onChange={setSet} options={setOptions(options)} />
          <SampleSizeSelect
            id="exp-limit"
            label="Products per variant"
            value={limit}
            onChange={setLimit}
            available={options.sets.find((s) => s.id === set)?.products}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {variantFields("A", a, setA)}
            {variantFields("B", b, setB)}
          </div>
          {same ? <p className="text-xs text-error">Pick a different model or prompt for one variant.</p> : null}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || !set || same || !isValidSampleSize(limit) || busy} onClick={() => void start()}>
            {busy ? "Starting" : "Start experiment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const COMPARED: { key: string; label: string; better: "higher" | "lower"; value: (r: EvalRun) => number | null; format: (v: number | null) => string }[] = [
  { key: "ai", label: "AI field accuracy", better: "higher", value: (r) => overallAccuracy(r, ["category", "status", "claims.recall", "attributes"]), format: pct },
  { key: "category", label: fieldLabel("category"), better: "higher", value: (r) => accuracy(r.scores.category), format: pct },
  { key: "status", label: fieldLabel("status"), better: "higher", value: (r) => accuracy(r.scores.status), format: pct },
  { key: "claims", label: fieldLabel("claims.recall"), better: "higher", value: (r) => accuracy(r.scores["claims.recall"]), format: pct },
  { key: "invented", label: "Invented claims", better: "lower", value: (r) => r.invented_claims, format: (v) => (v === null ? "–" : formatNumber(v)) },
  { key: "failures", label: "Failed builds", better: "lower", value: (r) => r.failures, format: (v) => (v === null ? "–" : formatNumber(v)) },
  { key: "cost", label: "Cost per 1,000 products", better: "lower", value: (r) => (r.done ? (r.cost_micros / r.done) * 1000 : null), format: (v) => (v === null ? "–" : formatUsd(v)) },
  { key: "latency", label: "p50 build time", better: "lower", value: (r) => r.p50_ms || null, format: (v) => (v === null ? "–" : formatDuration(v)) },
];

function Comparison({ experiment, onChanged }: { experiment: Experiment; onChanged: () => void }) {
  const [a, b] = experiment.variants;
  const finished = a?.status === "completed" && b?.status === "completed";
  if (!a || !b) return null;

  return (
    <Panel
      title={experiment.name}
      icon={FlaskConical}
      action={<span className="text-xs text-muted-foreground">{experiment.set} · {formatDateTime(experiment.created_at)}</span>}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="h-10 px-4 text-left font-medium">Metric</th>
              {[a, b].map((r) => (
                <th key={r.id} scope="col" className="h-10 px-4 text-right font-medium">
                  <span className="block text-foreground">
                    {r.label}: {r.model}
                  </span>
                  <span className="block">{r.prompt_version}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-2.5 text-muted-foreground">Status</td>
              {[a, b].map((r) => (
                <td key={r.id} className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <RunStatus run={r} />
                    <RunActions run={r} onChanged={onChanged} />
                  </div>
                  {r.error ? <span className="mt-0.5 block text-xs text-error">{r.error}</span> : null}
                </td>
              ))}
            </tr>
            {COMPARED.map((m) => {
              const va = m.value(a);
              const vb = m.value(b);
              const winner = finished && va !== null && vb !== null && va !== vb ? ((m.better === "higher" ? va > vb : va < vb) ? a.id : b.id) : null;
              return (
                <tr key={m.key} className="border-b last:border-0">
                  <td className="px-4 py-2.5 text-muted-foreground">{m.label}</td>
                  {[
                    [a, va],
                    [b, vb],
                  ].map(([r, v]) => (
                    <td key={(r as EvalRun).id} className={cn("px-4 py-2.5 text-right tabular-nums", winner === (r as EvalRun).id && "font-medium text-success")}>
                      {winner === (r as EvalRun).id ? <Trophy className="mr-1.5 inline size-3.5" /> : null}
                      {m.format(v as number | null)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function ExperimentsView() {
  const [data, setData] = useState<(EvalOptions & { experiments: Experiment[] }) | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    api<EvalOptions & { experiments: Experiment[] }>("/api/experiments")
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  const running = data?.experiments.some((e) => e.variants.some((v) => v.status === "queued" || v.status === "running")) ?? false;
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const createButton = (label: string) =>
    data?.sets.length ? (
      <Button onClick={() => setCreating(true)}>
        <Plus data-icon="inline-start" />
        {label}
      </Button>
    ) : (
      <Button onClick={() => setUploading(true)}>
        <Upload data-icon="inline-start" />
        Upload labelled set
      </Button>
    );

  if (!data) {
    return (
      <>
        <PageHeader title="Experiments" meta="A/B tests of prompts and models" />
        <PageLoader />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Experiments" meta="A/B tests of prompts and models" actions={data.experiments.length ? createButton("New experiment") : null} />
      {data.sets.length ? <NewExperiment options={data} open={creating} onOpenChange={setCreating} onStarted={load} onPromptsChanged={load} /> : null}
      {data.experiments.length === 0 ? (
        <EmptyState
          title="No experiments yet"
          description={
            data.sets.length
              ? "Compare two models or prompts on the same labelled products: accuracy, invented claims, cost per 1,000 products and speed."
              : "Upload a supplier sheet with a labels.json of the expected products first, then compare two models or prompts on it."
          }
          action={
            data.sets.length ? (
              createButton("Create experiment")
            ) : (
              <Button onClick={() => setUploading(true)}>
                <Upload data-icon="inline-start" />
                Upload labelled set
              </Button>
            )
          }
        />
      ) : null}
      <UploadEvalSet open={uploading} onOpenChange={setUploading} onCreated={load} />
      {data.experiments.map((e) => (
        <Comparison key={e.id} experiment={e} onChanged={load} />
      ))}
    </>
  );
}
