"use client";

import { Cpu, Gauge, Layers, Pause, Server, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { queues, workers } from "@/lib/data/platform";
import { useImports } from "@/lib/data/store";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader, Panel, StatCard, StatusLabel } from "./common";

export function QueueView() {
  const imports = useImports();
  const paused = imports.find((j) => j.status === "paused");
  const waiting = queues.reduce((a, q) => a + q.waiting, 0);
  const active = queues.reduce((a, q) => a + q.active, 0);
  const capacity = workers.reduce((a, w) => a + w.concurrency, 0);

  return (
    <>
      <PageHeader
        title="Queue & workers"
        meta="Each stage runs on its own queue so a slow AI call never blocks parsing or the storefront"
        actions={
          <Button variant="outline" onClick={() => toast("Queues paused", { description: "Running jobs finish, new jobs wait" })}>
            <Pause data-icon="inline-start" />
            Pause all
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Layers} label="Jobs waiting" value={formatNumber(waiting)} hint="Across all queues" />
        <StatCard icon={Cpu} label="Running" value={`${active} / ${capacity}`} hint="Active jobs / worker slots" />
        <StatCard icon={Server} label="Workers" value={workers.length} hint={`${workers.filter((w) => w.status === "busy").length} busy`} />
        <StatCard
          icon={Timer}
          label="Rate limit"
          value={paused ? "Paused" : "OK"}
          hint={paused?.resume_in_seconds ? `ai.cheap resumes in ${Math.ceil(paused.resume_in_seconds / 60)} min` : "No provider limits hit"}
        />
      </div>

      <Panel title="Queues" icon={Layers} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Queue</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Load</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Waiting</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Active</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Completed</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => {
                const load = q.active / q.concurrency;
                return (
                  <tr key={q.name} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{q.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", load >= 1 ? "bg-warning" : "bg-chart-2")} style={{ width: `${load * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {q.active}/{q.concurrency}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(q.waiting)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{q.active}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatNumber(q.completed)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums", q.failed > 0 && "text-error")}>{q.failed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Workers" icon={Gauge} bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Worker</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Queue</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Status</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Slots</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Processed</th>
                <th scope="col" className="h-9 px-4 text-right font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{w.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{w.queue}</td>
                  <td className="px-4 py-3">
                    <StatusLabel tone={w.status === "busy" ? "info" : w.status === "draining" ? "warning" : "neutral"}>
                      {w.status[0].toUpperCase() + w.status.slice(1)}
                    </StatusLabel>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {w.active}/{w.concurrency}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(w.processed)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {Math.floor(w.uptime_min / 60)}h {w.uptime_min % 60}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
