"use client";

import { AlertTriangle, Check, ChevronDown, ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { actions } from "@/lib/data/store";
import type { ImportJob, UnmatchedPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isActive } from "./import-actions";

function Thumb({ photo, className }: { photo: UnmatchedPhoto; className?: string }) {
  return photo.url ? (
    // eslint-disable-next-line @next/next/no-img-element -- private, store-scoped photo route
    <img src={photo.url} alt={className ? photo.name : ""} loading="lazy" className={cn("size-full object-cover", className)} />
  ) : (
    <ImageIcon className="size-3.5 text-muted-foreground" />
  );
}

function Suggestion({ job, photo }: { job: ImportJob; photo: UnmatchedPhoto }) {
  const [busy, setBusy] = useState(false);
  const suggestion = photo.suggestion!;
  const resolve = async (accept: boolean) => {
    setBusy(true);
    await actions.resolvePhoto(job.id, photo.id!, accept);
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1.5 border border-border bg-background p-2 text-xs">
      <span className="text-muted-foreground">
        AI suggests <span className="tabular-nums">({suggestion.confidence}%)</span>
      </span>
      <Link href={`/products/${suggestion.product_id}`} className="line-clamp-2 font-medium underline-offset-4 hover:underline" title={suggestion.reason}>
        {suggestion.title}
      </Link>
      <div className="flex gap-1.5">
        <Button size="xs" disabled={busy} onClick={() => resolve(true)}>
          <Check data-icon="inline-start" />
          Attach
        </Button>
        <Button size="xs" variant="outline" disabled={busy} onClick={() => resolve(false)} aria-label={`Dismiss suggestion for ${photo.name}`}>
          <X />
        </Button>
      </div>
    </div>
  );
}

function MatchButton({ job, className }: { job: ImportJob; className?: string }) {
  const [starting, setStarting] = useState(false);
  if (job.photo_match === "queued" || job.photo_match === "running") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="size-3.5 animate-spin" />
        Matching with AI…
      </span>
    );
  }
  if (isActive(job) || !job.unmatched_photos.some((p) => p.id && !p.ai_checked)) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      disabled={starting}
      onClick={async () => {
        setStarting(true);
        await actions.matchPhotos(job.id);
        setStarting(false);
      }}
    >
      <Sparkles data-icon="inline-start" />
      {job.photo_match === "failed" ? "Retry AI match" : "Match with AI"}
    </Button>
  );
}

export function UnmatchedPhotos({ job, compact = false }: { job: ImportJob; compact?: boolean }) {
  const photos = job.unmatched_photos;
  const suggested = photos.filter((p) => p.suggestion).length;
  const thumbs = (
    <span className="flex -space-x-2 group-data-[state=open]/photos:hidden">
      {photos.slice(0, 3).map((p) => (
        <span key={p.name} className="flex size-7 items-center justify-center overflow-hidden border-2 border-background bg-muted">
          <Thumb photo={p} />
        </span>
      ))}
    </span>
  );
  return (
    <Collapsible className="group/photos shrink-0 overflow-hidden border border-warning/30 bg-warning/5">
      <div className={cn("flex", compact ? "flex-col" : "items-center gap-3 pr-4")}>
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {photos.length} photo{photos.length === 1 ? "" : "s"} didn&apos;t match any row
            </span>
            {compact ? null : (
              <span className="ml-2 text-muted-foreground">
                {suggested ? `${suggested} with an AI suggestion to confirm.` : "Not attached to a product. Match by SKU in the file name or the image column, or let AI look at them."}
              </span>
            )}
          </span>
          {compact ? null : thumbs}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/photos:rotate-180" />
        </CollapsibleTrigger>
        {compact ? (
          <div className="flex items-center justify-between gap-3 px-4 pb-3">
            {thumbs}
            <MatchButton job={job} className="ml-auto" />
          </div>
        ) : (
          <MatchButton job={job} />
        )}
      </div>
      <CollapsibleContent>
        <ul className={cn("grid gap-3 border-t border-warning/20 p-4", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6")}>
          {photos.map((p) => (
            <li key={p.name} className="flex flex-col gap-1.5">
              <span className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                <Thumb photo={p} className="size-full" />
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">{p.name}</span>
              {p.suggestion && p.id ? <Suggestion job={job} photo={p} /> : null}
              {p.note ? <span className="line-clamp-3 text-xs text-muted-foreground" title={p.note}>{p.note}</span> : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
