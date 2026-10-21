"use client";

import { useState } from "react";
import { useImports, useImportsReady } from "@/lib/data/store";
import { formatBytes, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { ImportStatusLabel } from "./common";
import { EmptyState } from "./empty-state";
import { ImportActions } from "./import-actions";
import { ImportProgressCell, statusDetail } from "./import-progress";
import { ImportSheet } from "./import-sheet";
import { PageLoader } from "./page-loader";
import { UploadButton } from "./upload-dialog";

export function ImportQueue() {
  const imports = useImports();
  const ready = useImportsReady();
  const [selected, setSelected] = useState<string | null>(null);

  if (!ready) return <PageLoader />;

  if (imports.length === 0) {
    return (
      <EmptyState
        title="No imports yet"
        description="Upload a supplier sheet and its photos. Products, translations and review items will appear here as the import runs."
        action={<UploadButton label="Upload a sheet" />}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed text-sm">
            <caption className="sr-only">Imports, newest first. Select a row for details.</caption>
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[20%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-20" />
            </colgroup>
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-10 px-4 font-medium">File</th>
                <th scope="col" className="h-10 px-4 font-medium">Status</th>
                <th scope="col" className="h-10 px-4 font-medium">Rows</th>
                <th scope="col" className="h-10 px-4 text-right font-medium">Cost</th>
                <th scope="col" className="h-10 px-4 font-medium">Started</th>
                <th scope="col" className="h-10 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {imports.map((job) => {
                const detail = statusDetail(job);
                return (
                  <tr
                    key={job.id}
                    tabIndex={0}
                    aria-label={`Open ${job.file_name}`}
                    data-state={selected === job.id ? "selected" : undefined}
                    onClick={() => setSelected(job.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(job.id)}
                    className="cursor-pointer border-b outline-none last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 data-[state=selected]:bg-muted/60"
                  >
                    <td className="px-4 py-3.5 align-middle">
                      <span className="block truncate font-medium">{job.file_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatBytes(job.file_bytes)} · {formatNumber(job.photo_count)} photos
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <ImportStatusLabel status={job.status} />
                      {detail ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span> : null}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <ImportProgressCell job={job} />
                    </td>
                    <td className="px-4 py-3.5 text-right align-middle tabular-nums">
                      {job.cost_micros ? formatUsd(job.cost_micros) : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="px-4 py-3.5 align-middle tabular-nums text-muted-foreground">{formatDateTime(job.created_at)}</td>
                    <td className="px-2 py-3.5 align-middle" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <ImportActions job={job} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ImportSheet job={imports.find((j) => j.id === selected)} onClose={() => setSelected(null)} />
    </>
  );
}
