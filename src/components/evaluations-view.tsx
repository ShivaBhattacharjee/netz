"use client";

import { FlaskConical, Play, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/data/api";
import { formatDateTime, formatDuration, formatNumber, formatUsd } from "@/lib/format";
import type { EvalOptions, EvalRun } from "@/lib/types";
import { PageHeader, Panel } from "./common";
import { EmptyState } from "./empty-state";
import { EvalSetsPanel, UploadEvalSet } from "./eval-sets";
import {
  AI_FIELDS,
  AccuracyBar,
  RunActions,
  RunSetupSheet,
  RunStatus,
  accuracy,
  fieldLabel,
  overallAccuracy,
  pct,
} from "./eval-common";
import { PageLoader } from "./page-loader";

function RunDetail({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const [run, setRun] = useState<EvalRun | null>(null);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    api<{ run: EvalRun }>(`/api/evals/${runId}`)
      .then((r) => !cancelled && setRun(r.run))
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [runId]);
  const shown = run && run.id === runId ? run : null;

  return (
    <Sheet open={runId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <span className="text-xs text-muted-foreground">Evaluation</span>
          <SheetTitle className="text-lg">{shown?.label ?? "…"}</SheetTitle>
          <SheetDescription>{shown ? `${shown.set} · ${formatNumber(shown.done)} products built · ${formatDateTime(shown.created_at)}` : ""}</SheetDescription>
        </SheetHeader>
        {shown ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
            <ul className="flex flex-col gap-3">
              {Object.entries(shown.scores).map(([field, score]) => (
                <li key={field} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{fieldLabel(field)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {pct(accuracy(score))} · {formatNumber(score.correct)}/{formatNumber(score.total)}
                    </span>
                  </div>
                  <AccuracyBar value={accuracy(score)} />
                </li>
              ))}
            </ul>
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Mismatches {shown.notes?.length ? `(first ${shown.notes.length})` : ""}</h3>
              {shown.notes?.length ? (
                <ul className="flex flex-col divide-y border font-mono text-xs">
                  {shown.notes.map((n, i) => (
                    <li key={i} className="px-3 py-2 break-words">
                      {n}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None.</p>
              )}
            </section>
          </div>
        ) : (
          <PageLoader />
        )}
      </SheetContent>
    </Sheet>
  );
}

export function EvaluationsView() {
  const [data, setData] = useState<(EvalOptions & { runs: EvalRun[] }) | null>(null);
  const [starting, setStarting] = useState(false);
  const [retryRun, setRetryRun] = useState<EvalRun | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [tab, setTab] = useState("runs");

  const load = useCallback(() => {
    api<EvalOptions & { runs: EvalRun[] }>("/api/evals")
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  const running = data?.runs.some((r) => r.status === "queued" || r.status === "running") ?? false;
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const startButton = (label: string) =>
    data?.sets.length ? (
      <Button onClick={() => setStarting(true)}>
        <Play data-icon="inline-start" />
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
        <PageHeader title="Evaluations" meta="Accuracy per field against a labelled set" />
        <PageLoader />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Evaluations"
        meta="Accuracy per field against a labelled set"
        actions={
          <>
            <Button variant="outline" onClick={() => setUploading(true)}>
              <Upload data-icon="inline-start" />
              Upload set
            </Button>
            {data.sets.length ? startButton("Run evaluation") : null}
          </>
        }
      />
      {data.sets.length ? (
        <RunSetupSheet
          options={data}
          open={starting}
          initialRun={retryRun}
          onOpenChange={(open) => { setStarting(open); if (!open) setRetryRun(null); }}
          onStarted={load}
          onPromptsChanged={load}
        />
      ) : null}
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList variant="line" aria-label="Evaluation sections">
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="sets">Labelled sets{data.sets.length ? ` · ${data.sets.length}` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="flex flex-col gap-6">
          {data.runs.length === 0 ? (
            <EmptyState
              title="No evaluation runs yet"
              description={data.sets.length
                ? "Run the pipeline on a labelled supplier sheet and see how accurate grouping, prices, categories, review decisions and claims are."
                : "Upload a supplier sheet with a labels.json of the expected products, then run the pipeline on it and score every field."}
              action={data.sets.length ? startButton("Run first evaluation") : null}
             
            />
          ) : null}

          {data.runs.length ? (
            <Panel title="Runs" icon={FlaskConical} bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className="h-9 px-4 text-left font-medium">Run</th>
                      <th scope="col" className="h-9 px-4 text-left font-medium">Status</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">Cleaning</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">AI fields</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">Invented claims</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">Cost</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">p50</th>
                      <th scope="col" className="h-9 px-4 text-right font-medium">Started</th>
                      <th scope="col" className="h-9 w-16 px-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map((r) => (
                      <tr key={r.id} tabIndex={0} aria-label={`View results for ${r.label}`} onClick={() => setOpenRun(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenRun(r.id); } }} className="cursor-pointer border-b last:border-0 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
                        <td className="px-4 py-3">
                          <span className="block font-medium">{r.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {r.set} · {r.prompt_version}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <RunStatus run={r} />
                          {r.error ? <span className="mt-0.5 block text-xs text-error">{r.error}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(overallAccuracy(r, ["grouping", "variants.sku", "variants.price_cents", "variants.currency", "variants.weight_grams", "variants.options"]))}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{pct(overallAccuracy(r, [...AI_FIELDS, "attributes"]))}</td>
                        <td className={r.invented_claims ? "px-4 py-3 text-right tabular-nums text-error" : "px-4 py-3 text-right tabular-nums"}>{formatNumber(r.invented_claims)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatUsd(r.cost_micros, 4)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{r.p50_ms ? formatDuration(r.p50_ms) : "–"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatDateTime(r.created_at)}</td>
                        <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}><RunActions run={r} onChanged={load} onDeleted={() => setOpenRun(null)} onRetry={() => { setRetryRun(r); setStarting(true); }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </TabsContent>
        <TabsContent value="sets">
          {data.sets.length ? (
            <EvalSetsPanel sets={data.sets} onChanged={load} />
          ) : (
            <EmptyState
              title="No labelled sets yet"
              description="Upload a supplier sheet and labels.json to run evaluations and compare prompts or models."
             
            />
          )}
        </TabsContent>
      </Tabs>
      <UploadEvalSet open={uploading} onOpenChange={setUploading} onCreated={() => { load(); setTab("sets"); }} />

      <RunDetail runId={openRun} onClose={() => setOpenRun(null)} />
    </>
  );
}
