"use client";

import { AlertTriangle, ChevronDown, ImageIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function UnmatchedPhotos({ photos, compact = false }: { photos: string[]; compact?: boolean }) {
  return (
    <Collapsible className="group/photos overflow-hidden rounded-xl border border-warning/30 bg-warning/5">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        <span className="flex-1">
          <span className="font-medium">
            {photos.length} photo{photos.length === 1 ? "" : "s"} didn&apos;t match any row
          </span>
          {compact ? null : <span className="ml-2 text-muted-foreground">Not attached to a product. Match by SKU in the file name or the image column.</span>}
        </span>
        <span className="flex -space-x-2">
          {photos.slice(0, 3).map((p) => (
            <span key={p} className="flex size-7 items-center justify-center rounded-md border-2 border-background bg-muted">
              <ImageIcon className="size-3.5 text-muted-foreground" />
            </span>
          ))}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]/photos:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className={cn("grid gap-3 border-t border-warning/20 p-4", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6")}>
          {photos.map((p) => (
            <li key={p} className="flex flex-col gap-1.5">
              <span className="flex aspect-square items-center justify-center rounded-lg bg-muted">
                <ImageIcon className="size-5 text-muted-foreground" />
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">{p}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
