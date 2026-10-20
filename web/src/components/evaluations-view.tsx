"use client";

import { ArrowDownRight, ArrowUpRight, Database, FlaskConical, Minus, Play, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { evalRuns, evalSet, fieldAccuracy } from "@/lib/data/platform";
import { formatDateTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, Panel, StatCard } from "./common";

const config = {
  accuracy: { label: "Accuracy", color: "var(--chart-2)" },
  previous: { label: "Previous run", color: "var(--chart-3)" },
} satisfies ChartConfig;

function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  const Icon = d > 0.05 ? ArrowUpRight : d < -0.05 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", d > 0.05 ? "text-success" : d < -0.05 ? "text-error" : "text-muted-foreground")}>
      <Icon className="size-3.5" />
      {Math.abs(d).toFixed(1)}
    </span>
  );
}

export function EvaluationsView() {
  const latest = evalRuns[0];
  const weakest = [...fieldAccuracy].sort((a, b) => a.accuracy - b.accuracy)[0];

  return (
    <>
      <PageHeader
        title="Evaluations"
        meta={`Scored against ${evalSet.name}, ${evalSet.products} hand-labelled products`}
        actions={
          <Button onClick={() => toast.success("Evaluation queued", { description: `${evalSet.products} products · prompt v4 · routing on` })}>
            <Play data-icon="inline-start" />
            Run evaluation
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Target} label="Overall accuracy" value={`${latest.accuracy}%`} hint={<Delta now={latest.accuracy} before={evalRuns[2].accuracy} />} />
        <StatCard icon={ShieldCheck} label="Invented claims" value={latest.invented_claims} hint="Claims without a source in the labelled set" />
        <StatCard icon={FlaskConical} label="Weakest field" value={weakest.field} hint={`${weakest.accuracy}% accurate`} />
        <StatCard icon={Database} label="Test set" value={evalSet.products} hint={evalSet.source} />
      </div>

      <Panel title="Accuracy per field" icon={Target} action={<span className="text-xs text-muted-foreground">latest run vs previous</span>}>
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <BarChart data={fieldAccuracy} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="field" tickLine={false} axisLine={false} tickMargin={8} interval={0} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={56} />
            <YAxis tickLine={false} axisLine={false} width={36} domain={[70, 100]} tickFormatter={(v) => `${v}%`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar isAnimationActive={false} dataKey="previous" fill="var(--color-previous)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar isAnimationActive={false} dataKey="accuracy" fill="var(--color-accuracy)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ChartContainer>
      </Panel>

      <Panel title="Runs" icon={FlaskConical} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Run</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Model</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Prompt</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Accuracy</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Invented claims</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Cost</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {evalRuns.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.label}</span>
                    {i === 0 ? <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Latest</span> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.model}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.prompt}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.accuracy}%</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", r.invented_claims > 0 && "text-error")}>{r.invented_claims}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatUsd(r.cost_micros)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDateTime(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Field breakdown" icon={Database} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Field</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Accuracy</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Change</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Samples</th>
              </tr>
            </thead>
            <tbody>
              {fieldAccuracy.map((f) => (
                <tr key={f.field} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{f.field}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", f.accuracy >= 95 ? "bg-success" : f.accuracy >= 88 ? "bg-chart-2" : "bg-warning")} style={{ width: `${f.accuracy}%` }} />
                      </div>
                      <span className="tabular-nums">{f.accuracy}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Delta now={f.accuracy} before={f.previous} />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{f.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
