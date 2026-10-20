"use client";

import { Beaker, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { experiments, type Experiment } from "@/lib/data/platform";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, StatusLabel } from "./common";

const statusTone = { running: "info", concluded: "success", draft: "neutral" } as const;

function ExperimentCard({ exp }: { exp: Experiment }) {
  const best = exp.variants.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const metrics: { label: string; get: (v: Experiment["variants"][number]) => string; better: "high" | "low"; raw: (v: Experiment["variants"][number]) => number }[] = [
    { label: "Accuracy", get: (v) => `${v.accuracy}%`, better: "high", raw: (v) => v.accuracy },
    { label: "Review rate", get: (v) => `${v.review_rate}%`, better: "low", raw: (v) => v.review_rate },
    { label: "Cost / 1k", get: (v) => formatUsd(v.cost_per_1k_micros), better: "low", raw: (v) => v.cost_per_1k_micros },
    { label: "p50 latency", get: (v) => `${(v.p50_ms / 1000).toFixed(1)} s`, better: "low", raw: (v) => v.p50_ms },
  ];
  const draft = exp.status === "draft";

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Beaker className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">{exp.name}</h2>
        <StatusLabel tone={statusTone[exp.status]}>{exp.status[0].toUpperCase() + exp.status.slice(1)}</StatusLabel>
        <span className="ml-auto text-xs text-muted-foreground">
          {exp.metric} · started {formatDateTime(exp.started_at)}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="h-9 px-4 text-left font-medium">Variant</th>
              <th scope="col" className="h-9 px-4 text-left font-medium">Setup</th>
              <th scope="col" className="h-9 px-4 text-right font-medium">Products</th>
              {metrics.map((mt) => (
                <th key={mt.label} scope="col" className="h-9 px-4 text-right font-medium">
                  {mt.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exp.variants.map((v) => (
              <tr key={v.name} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium">
                    {v.name}
                    {exp.winner === v.name ? <Trophy className="size-3.5 text-warning" aria-label="Winner" /> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{v.traffic}% traffic</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {v.model} · {v.prompt}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{draft ? "–" : formatNumber(v.products)}</td>
                {metrics.map((mt) => {
                  const values = exp.variants.map(mt.raw);
                  const best = mt.better === "high" ? Math.max(...values) : Math.min(...values);
                  return (
                    <td key={mt.label} className={cn("px-4 py-3 text-right tabular-nums", !draft && mt.raw(v) === best && "font-medium text-success")}>
                      {draft ? "–" : mt.get(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!draft ? (
        <footer className="flex flex-wrap items-center gap-4 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">Confidence</span>
          <Progress value={exp.confidence} className="h-1.5 w-40" />
          <span className="tabular-nums">{exp.confidence}%</span>
          <span className="ml-auto text-muted-foreground">
            {exp.winner ? `Winner: ${exp.winner}` : exp.confidence >= 95 ? `Leading: ${best.name}` : `Leading: ${best.name}, needs more data`}
          </span>
          {exp.status === "running" ? (
            <Button variant="outline" size="sm" onClick={() => toast.success(`${exp.name} stopped`, { description: `${best.name} promoted to 100% traffic` })}>
              Promote leader
            </Button>
          ) : null}
        </footer>
      ) : (
        <footer className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          Not started
          <Button size="sm" onClick={() => toast.success("Experiment started", { description: "Traffic split 50/50 on new imports" })}>
            Start
          </Button>
        </footer>
      )}
    </section>
  );
}

export function ExperimentsView() {
  return (
    <>
      <PageHeader
        title="Experiments"
        meta="Split new imports between prompts or models and compare outcomes"
        actions={
          <Button onClick={() => toast("Experiment builder comes with the API")}>
            <Plus data-icon="inline-start" />
            New experiment
          </Button>
        }
      />
      <div className="flex flex-col gap-4">
        {experiments.map((e) => (
          <ExperimentCard key={e.id} exp={e} />
        ))}
      </div>
    </>
  );
}
