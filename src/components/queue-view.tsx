"use client";

import { Cpu, Layers, RefreshCw, Server, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/data/api";
import { formatNumber } from "@/lib/format";
import type { QueueStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, Panel, StatCard } from "./common";
import { EmptyState } from "./empty-state";
import { PageLoader } from "./page-loader";

const INTERVALS = [
  { value: "1000", label: "Every 1 second" },
  { value: "3000", label: "Every 3 seconds" },
  { value: "10000", label: "Every 10 seconds" },
  { value: "30000", label: "Every 30 seconds" },
  { value: "60000", label: "Every minute" },
  { value: "0", label: "Paused" },
];
const INTERVAL_KEY = "queue-refresh-ms";

function savedInterval() {
  try {
    const saved = window.localStorage.getItem(INTERVAL_KEY);
    return saved && INTERVALS.some((i) => i.value === saved) ? saved : "3000";
  } catch {
    return "3000";
  }
}

const descriptions: Record<string, string> = {
  parse: "Reads the sheet, cleans and groups rows, matches photos",
  "ai.cheap": "Builds clean product groups with the fast model",
  "ai.strong": "Builds messy groups and photo-heavy products with the stronger model",
  translate: "Translates titles, descriptions, SEO fields and attributes into German and French in one call",
  webhooks: "Delivers signed webhook events to your endpoints",
  eval: "Scores the pipeline against labelled eval sets",
};

function useQueueStats(intervalMs: number) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api<QueueStats>("/api/queues"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!intervalMs) return;
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { stats, error, loading, refresh };
}

export function QueueView() {
  const [interval, setIntervalValue] = useState("3000");
  useEffect(() => setIntervalValue(savedInterval()), []);
  const { stats, error, loading, refresh } = useQueueStats(Number(interval));

  const header = (
    <PageHeader
      title="Queue & workers"
      meta="Live job counts for each queue"
      actions={
        <>
          <Select
            value={interval}
            onValueChange={(v) => {
              setIntervalValue(v);
              try {
                window.localStorage.setItem(INTERVAL_KEY, v);
              } catch {}
            }}
          >
            <SelectTrigger className="h-10 w-44" aria-label="Refresh interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" aria-label="Refresh now" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </>
      }
    />
  );

  if (!stats) {
    return (
      <>
        {header}
        {error ? <EmptyState title="Queue unavailable" description={error} /> : <PageLoader />}
      </>
    );
  }

  const waiting = stats.queues.reduce((a, q) => a + q.waiting + q.delayed, 0);
  const active = stats.queues.reduce((a, q) => a + q.active, 0);
  const workers = stats.queues.reduce((a, q) => a + q.workers, 0);
  const resumeMin = stats.pause ? Math.max(1, Math.ceil((new Date(stats.pause.until).getTime() - Date.now()) / 60_000)) : 0;

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Layers} label="Jobs waiting" value={formatNumber(waiting)} hint="Including delayed retries" />
        <StatCard icon={Cpu} label="Running" value={formatNumber(active)} hint="Jobs being processed now" />
        <StatCard icon={Server} label="Workers" value={formatNumber(workers)} hint={workers === 0 ? "Start one with pnpm worker" : "Connected to the queues"} />
        <StatCard
          icon={Timer}
          label="AI calls"
          value={stats.pause ? "Paused" : "Running"}
          hint={stats.pause ? `${stats.pause.reason}, resuming in ${resumeMin} min` : "No provider limits hit"}
        />
      </div>

      <Panel title="Queues" icon={Layers} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Queue</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Workers</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Waiting</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Delayed</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Active</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Completed</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {stats.queues.map((q) => (
                <tr key={q.name} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="block font-mono text-xs">{q.name}</span>
                    <span className="block text-xs text-muted-foreground">{descriptions[q.name]}</span>
                  </td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", q.workers === 0 && "text-warning")}>{q.workers}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(q.waiting)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(q.delayed)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(q.active)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(q.completed)}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", q.failed > 0 && "text-error")}>{formatNumber(q.failed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
