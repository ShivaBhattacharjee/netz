"use client";

import { Activity, Clock, Coins, Cpu, Filter, Gauge, Languages, Layers, PackageCheck, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/data/api";
import { useDataVersion } from "@/lib/data/store";
import type { Metrics } from "@/lib/types";
import { formatDuration, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { PageHeader, Panel, StatCard } from "./common";
import { PageLoader } from "./page-loader";

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const throughputConfig = {
  done: { label: "Done", color: "var(--success)" },
  review: { label: "Needs review", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--error)" },
} satisfies ChartConfig;

const outcomeConfig = {
  approved: { label: "Approved", color: "var(--success)" },
  ready: { label: "Ready", color: "var(--chart-2)" },
  needs_review: { label: "Needs review", color: "var(--warning)" },
  failed: { label: "Failed", color: "var(--error)" },
} satisfies ChartConfig;

const costConfig = {
  spend: { label: "Spend", color: "var(--chart-1)" },
  saved: { label: "Saved", color: "var(--chart-3)" },
} satisfies ChartConfig;

const latencyConfig = { count: { label: "Products", color: "var(--chart-2)" } } satisfies ChartConfig;

function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: i.color }} />
          {i.label}
          {i.value ? <span className="tabular-nums text-foreground">{i.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function useMetrics(days: string) {
  const version = useDataVersion();
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<Metrics>(`/api/metrics?days=${days}`)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days, version]);
  return { data, error };
}

export function MetricsView() {
  const [range, setRange] = useState("14");
  const { data, error } = useMetrics(range);

  const m = useMemo(() => {
    if (!data) return null;
    return {
      total: data.total,
      by: data.by,
      cost: data.cost_micros,
      baseline: data.baseline_micros,
      avg: data.avg_ms,
      p95: data.p95_ms,
      buckets: data.latency,
      coverage: data.coverage,
      funnel: data.funnel,
      models: data.models.map((md) => ({ model: md.model, products: md.products, cost: md.cost_micros / 1_000_000 })),
      outcomes: (Object.keys(data.by) as (keyof typeof data.by)[]).map((k) => ({ status: k, value: data.by[k], fill: `var(--color-${k})` })),
    };
  }, [data]);

  const header = (
    <PageHeader
      title="Overview"
      meta="Throughput, quality and AI spend across all imports"
      actions={
        <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v)}>
          <ToggleGroupItem value="7">7 days</ToggleGroupItem>
          <ToggleGroupItem value="14">14 days</ToggleGroupItem>
        </ToggleGroup>
      }
    />
  );

  if (!data || !m) {
    return (
      <>
        {header}
        {error ? <p className="text-sm text-error">{error}</p> : <PageLoader />}
      </>
    );
  }

  const daily = data.daily.map((d) => ({
    day: shortDay(d.day),
    done: d.done,
    review: d.review,
    failed: d.failed,
    spend: d.cost_micros / 1_000_000,
    saved: d.saved_micros / 1_000_000,
  }));
  const rangeProducts = daily.reduce((a, d) => a + d.done + d.review + d.failed, 0);
  const rangeSpend = daily.reduce((a, d) => a + d.spend, 0);
  const rangeSaved = daily.reduce((a, d) => a + d.saved, 0);

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={PackageCheck} label="Products processed" value={formatNumber(rangeProducts)} hint={`${formatPercent(m.by.approved + m.by.ready, m.total)} built without review`} />
        <StatCard icon={Filter} label="Review rate" value={formatPercent(m.by.needs_review, m.total)} hint={`${formatNumber(m.by.needs_review)} waiting · ${formatNumber(m.by.failed)} failed`} />
        <StatCard icon={Coins} label="AI spend" value={formatUsd(rangeSpend * 1_000_000)} hint={`${formatUsd(rangeSaved * 1_000_000)} saved by routing and batching`} />
        <StatCard icon={Clock} label="Avg time per product" value={formatDuration(Math.round(m.avg))} hint={`p95 ${formatDuration(m.p95)}`} />
      </div>

      <Panel title="Throughput" icon={TrendingUp} action={<Legend items={Object.values(throughputConfig).map((c) => ({ label: c.label, color: c.color }))} />}>
        <ChartContainer config={throughputConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={daily} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              {Object.keys(throughputConfig).map((k) => (
                <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area isAnimationActive={false} dataKey="failed" type="monotone" stackId="a" stroke="var(--color-failed)" fill="url(#fill-failed)" />
            <Area isAnimationActive={false} dataKey="review" type="monotone" stackId="a" stroke="var(--color-review)" fill="url(#fill-review)" />
            <Area isAnimationActive={false} dataKey="done" type="monotone" stackId="a" stroke="var(--color-done)" fill="url(#fill-done)" />
          </AreaChart>
        </ChartContainer>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Catalog status" icon={PieIcon}>
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ChartContainer config={outcomeConfig} className="aspect-square h-48 shrink-0">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
                <Pie isAnimationActive={false} data={m.outcomes} dataKey="value" nameKey="status" innerRadius={58} outerRadius={84} strokeWidth={3} stroke="var(--card)">
                  {m.outcomes.map((o) => (
                    <Cell key={o.status} fill={o.fill} />
                  ))}
                  <Label
                    content={({ viewBox }) =>
                      viewBox && "cx" in viewBox ? (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                            {formatNumber(m.total)}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                            products
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="flex w-full flex-col divide-y">
              {m.outcomes.map((o) => (
                <li key={o.status} className="flex items-center gap-2 py-2 text-sm">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ background: outcomeConfig[o.status].color }} />
                  <span className="text-muted-foreground">{outcomeConfig[o.status].label}</span>
                  <span className="ml-auto tabular-nums">{formatNumber(o.value)}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{formatPercent(o.value, m.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="Pipeline" icon={Layers}>
          <ul className="flex flex-col gap-4">
            {m.funnel.map((f) => {
              const pct = (f.value / Math.max(1, m.funnel[0].value)) * 100;
              return (
                <li key={f.label} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="tabular-nums">{formatNumber(f.value)}</span>
                  </div>
                  <div className="h-6 overflow-hidden rounded-md bg-muted">
                    <div className="flex h-full items-center rounded-md bg-chart-2 px-2 text-xs font-medium text-white tabular-nums" style={{ width: `${Math.max(pct, 6)}%` }}>
                      {pct.toFixed(pct < 10 ? 1 : 0)}%
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="AI spend vs savings" icon={Coins} className="lg:col-span-2" action={<Legend items={Object.values(costConfig).map((c) => ({ label: c.label, color: c.color }))} />}>
          <ChartContainer config={costConfig} className="aspect-auto h-60 w-full">
            <BarChart data={daily} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${costConfig[name as keyof typeof costConfig]?.label ?? name} ${formatUsd(Number(v) * 1_000_000)}`} />} />
              <Bar isAnimationActive={false} maxBarSize={28} dataKey="spend" stackId="c" fill="var(--color-spend)" />
              <Bar isAnimationActive={false} maxBarSize={28} dataKey="saved" stackId="c" fill="var(--color-saved)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Panel>

        <Panel title="Spend by model" icon={Cpu} bodyClassName="p-0">
          <ul className="divide-y">
            {m.models.map((md) => {
              const share = md.cost / Math.max(1e-9, m.models.reduce((a, x) => a + x.cost, 0));
              return (
                <li key={md.model} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs">{md.model}</span>
                    <span className="tabular-nums">{formatUsd(md.cost * 1_000_000)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-2" style={{ width: `${share * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(md.products)} products · {formatPercent(md.products, m.total)} of volume
                  </span>
                </li>
              );
            })}
            <li className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted-foreground">Saved vs strong model only</span>
              <span className="tabular-nums text-success">{formatPercent(m.baseline - m.cost, m.baseline)}</span>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Processing time" icon={Gauge} action={<span className="text-xs text-muted-foreground">per product, incl. retries</span>}>
          <ChartContainer config={latencyConfig} className="aspect-auto h-52 w-full">
            <BarChart data={m.buckets} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <Bar isAnimationActive={false} maxBarSize={48} dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Panel>

        <Panel title="Translation coverage" icon={Languages} bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Language</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Coverage</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Out of date</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Missing</th>
              </tr>
            </thead>
            <tbody>
              {m.coverage.map((c) => (
                <tr key={c.language} className="border-b last:border-0">
                  <td className="px-4 py-3">{c.language}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                        <span className="h-full bg-success" style={{ width: `${(c.current / c.total) * 100}%` }} />
                        <span className="h-full bg-warning" style={{ width: `${(c.outOfDate / c.total) * 100}%` }} />
                      </div>
                      <span className="tabular-nums">{formatPercent(c.current, c.total)}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums ${c.outOfDate ? "text-warning" : "text-muted-foreground"}`}>{formatNumber(c.outOfDate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(c.missing)}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-3 text-muted-foreground">English</td>
                <td className="px-4 py-3 text-muted-foreground" colSpan={3}>
                  Source language, shown in every other country
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="size-3.5" /> Demo data. Numbers come from the mock layer until the API is connected.
      </p>
    </>
  );
}
