"use client";

import { ArrowUpRight, Download, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { actions } from "@/lib/data/store";
import { formatBytes, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ImportJob } from "@/lib/types";
import { ImportStatusLabel } from "./common";
import { canRetry, downloadFailed, retryLabel } from "./import-actions";
import { ImportBar, statusDetail } from "./import-progress";
import { UnmatchedPhotos } from "./unmatched-photos";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums">{children}</dd>
    </div>
  );
}

export function ImportSheet({ job, onClose }: { job: ImportJob | undefined; onClose: () => void }) {
  const [shown, setShown] = useState(job);
  if (job && job !== shown) setShown(job);
  return (
    <Sheet open={Boolean(job)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {shown ? <Body job={shown} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ job }: { job: ImportJob }) {
  const detail = statusDetail(job);
  const finished = job.total_rows - job.counts.pending;
  const counts = [
    { label: "Done", value: job.counts.done, dot: "bg-success" },
    { label: "Review", value: job.counts.needs_review, dot: "bg-warning" },
    { label: "Failed", value: job.counts.failed, dot: "bg-error" },
    { label: "Pending", value: job.counts.pending, dot: "bg-muted-foreground/50" },
  ];

  return (
    <>
      <SheetHeader className="border-b p-5">
        <span className="text-xs text-muted-foreground">Import</span>
        <SheetTitle className="truncate text-lg">{job.file_name}</SheetTitle>
        <SheetDescription className="flex items-center gap-3">
          <ImportStatusLabel status={job.status} />
          {detail ? <span className="truncate">{detail}</span> : null}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
        {job.unmatched_photos.length ? <UnmatchedPhotos photos={job.unmatched_photos} compact /> : null}
        {job.total_rows > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="tabular-nums">
                {formatNumber(finished)} / {formatNumber(job.total_rows)}
              </span>
            </div>
            <ImportBar job={job} />
            <dl className="grid grid-cols-4 gap-2">
              {counts.map((c) => (
                <div key={c.label} className="flex flex-col gap-1 rounded-lg border p-2.5">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden className={`size-1.5 rounded-full ${c.dot}`} />
                    {c.label}
                  </dt>
                  <dd className="text-base font-semibold tabular-nums">{formatNumber(c.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <dl className="flex flex-col divide-y border-y">
          <Row label="Started">{formatDateTime(job.created_at)}</Row>
          <Row label="File size">{formatBytes(job.file_bytes)}</Row>
          <Row label="Photos">{formatNumber(job.photo_count)}</Row>
          <Row label="Unmatched photos">{formatNumber(job.unmatched_photos.length)}</Row>
          <Row label="AI spend">{formatUsd(job.cost_micros)}</Row>
          {job.error && job.status !== "paused" ? <Row label="Error">{job.error}</Row> : null}
        </dl>

      </div>

      <SheetFooter className="flex-row gap-2 border-t p-5">
        {canRetry(job) ? (
          <Button variant="outline" onClick={() => void actions.retry(job.id)}>
            <RotateCw data-icon="inline-start" />
            {retryLabel(job)}
          </Button>
        ) : null}
        {job.counts.failed > 0 ? (
          <Button variant="outline" size="icon" aria-label="Download failed rows" onClick={() => void downloadFailed(job)}>
            <Download />
          </Button>
        ) : null}
        {job.total_rows > 0 ? (
          <Button asChild className="ml-auto">
            <Link href={`/imports/${job.id}`}>
              View all rows
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}
