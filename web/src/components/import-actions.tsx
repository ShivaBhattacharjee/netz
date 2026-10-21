"use client";

import { Ban, Download, ListTree, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { actions, fetchImportRows } from "@/lib/data/store";
import { download } from "@/lib/export";
import { formatNumber } from "@/lib/format";
import type { ImportJob } from "@/lib/types";
import { IconButton } from "./common";

export function isActive(job: ImportJob) {
  return job.status === "processing" || job.status === "paused" || job.status === "queued";
}

export function canRetry(job: ImportJob) {
  return job.status === "failed" || (!isActive(job) && job.counts.failed > 0);
}

export function retryLabel(job: ImportJob) {
  return job.status === "failed" && job.total_rows === 0
    ? "Retry import"
    : `Retry ${formatNumber(job.counts.failed)} failed row${job.counts.failed === 1 ? "" : "s"}`;
}

export async function downloadFailed(job: ImportJob) {
  const rows = await fetchImportRows(job.id, "failed");
  const csv = ["row,sku,reason", ...rows.map((r) => `${r.row},${r.sku},"${(r.reason ?? "").replace(/"/g, '""')}"`)].join("\n");
  download(`${job.file_name.replace(/\.[^.]+$/, "")}-failed-rows.csv`, csv, "text/csv");
}

export function ImportActions({ job, showView = true, onDeleted }: { job: ImportJob; showView?: boolean; onDeleted?: () => void }) {
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const active = isActive(job);

  return (
    <div className="flex items-center justify-end gap-0.5">
      <span className="flex size-7 items-center justify-center">
        {canRetry(job) ? <IconButton label={retryLabel(job)} icon={RotateCw} onClick={() => void actions.retry(job.id)} /> : null}
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${job.file_name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {showView && job.total_rows > 0 ? (
            <DropdownMenuItem asChild>
              <Link href={`/imports/${job.id}`}>
                <ListTree />
                View rows
              </Link>
            </DropdownMenuItem>
          ) : null}
          {canRetry(job) ? (
            <DropdownMenuItem onSelect={() => void actions.retry(job.id)}>
              <RotateCw />
              {retryLabel(job)}
            </DropdownMenuItem>
          ) : null}
          {job.counts.failed > 0 ? (
            <DropdownMenuItem onSelect={() => void downloadFailed(job)}>
              <Download />
              Download failed rows
            </DropdownMenuItem>
          ) : null}
          {showView || canRetry(job) || job.counts.failed > 0 ? <DropdownMenuSeparator /> : null}
          {active ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("cancel")}>
              <Ban />
              Cancel import
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
              <Trash2 />
              Delete import
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancel" ? "Cancel" : "Delete"} {job.file_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "cancel"
                ? `${formatNumber(job.counts.pending)} pending rows won't be processed. Finished rows keep their products.`
                : "The import and its row history are removed. Products it created stay in the catalog."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm === "cancel") void actions.cancelImport(job.id);
                else void actions.deleteImport(job.id).then((ok) => ok && onDeleted?.());
              }}
            >
              {confirm === "cancel" ? "Cancel import" : "Delete import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
