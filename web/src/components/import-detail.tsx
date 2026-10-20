"use client";

import { AlertTriangle, ChevronDown, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getImportRows } from "@/lib/data";
import { useImports } from "@/lib/data/store";
import { formatBytes, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ImportRow, RowStatus } from "@/lib/types";
import { ImportStatusLabel, PageHeader, RowStatusLabel } from "./common";
import { DataTable } from "./data-table";
import { FilterTabs } from "./filter-tabs";
import { ImportActions } from "./import-actions";
import { ImportBar, statusDetail } from "./import-progress";
import { Pagination } from "./pagination";

type Filter = RowStatus | "all";

const rowColumns: ColumnDef<ImportRow>[] = [
  { id: "row", accessorKey: "row", header: "Row", meta: { numeric: true, className: "w-20 text-muted-foreground" } },
  { id: "sku", accessorKey: "sku", header: "SKU", meta: { className: "font-mono text-xs" } },
  { id: "title", accessorKey: "title", header: "Supplier name" },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    filterFn: (row, _id, value: Filter) => value === "all" || row.original.status === value,
    cell: ({ row }) => <RowStatusLabel status={row.original.status} />,
  },
  { id: "reason", accessorKey: "reason", header: "Reason", meta: { className: "text-muted-foreground" }, cell: ({ row }) => row.original.reason ?? "" },
];

function UnmatchedPhotos({ photos }: { photos: string[] }) {
  return (
    <Collapsible className="group/photos overflow-hidden rounded-xl border border-warning/30 bg-warning/5">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        <span className="flex-1">
          <span className="font-medium">
            {photos.length} photo{photos.length === 1 ? "" : "s"} didn&apos;t match any row
          </span>
          <span className="ml-2 text-muted-foreground">Not attached to a product. Match by SKU in the file name or the image column.</span>
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
        <ul className="grid grid-cols-2 gap-3 border-t border-warning/20 p-4 sm:grid-cols-4 lg:grid-cols-6">
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

const statCards: { key: RowStatus; label: string; dot: string }[] = [
  { key: "done", label: "Done", dot: "bg-success" },
  { key: "needs_review", label: "Needs review", dot: "bg-warning" },
  { key: "failed", label: "Failed", dot: "bg-error" },
  { key: "pending", label: "Pending", dot: "bg-muted-foreground/50" },
];

export function ImportDetail({ id }: { id: string }) {
  const router = useRouter();
  const job = useImports().find((j) => j.id === id);
  const [filter, setFilter] = useState<Filter>("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const rows = useMemo(() => (job ? getImportRows(job) : []), [job]);
  const columnFilters = useMemo(() => [{ id: "status", value: filter }], [filter]);
  const table = useReactTable({
    data: rows,
    columns: rowColumns,
    state: { columnFilters, pagination },
    getRowId: (r) => String(r.row),
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!job) {
    return (
      <PageHeader
        title="Import not found"
        meta={
          <Link href="/imports" className="underline underline-offset-4">
            Back to imports
          </Link>
        }
      />
    );
  }

  const detail = statusDetail(job);
  const finished = job.total_rows - job.counts.pending;

  return (
    <>
      <PageHeader
        title={job.file_name}
        meta={`${formatBytes(job.file_bytes)} · ${formatNumber(job.photo_count)} photos · started ${formatDateTime(job.created_at)} · ${formatUsd(job.cost_micros)}`}
        actions={<ImportActions job={job} showView={false} onDeleted={() => router.push("/imports")} />}
      />

      {job.unmatched_photos.length ? <UnmatchedPhotos photos={job.unmatched_photos} /> : null}

      <Card className="gap-4 py-4">
        <CardContent className="flex flex-col gap-4 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <ImportStatusLabel status={job.status} />
              {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
            </div>
            {job.total_rows > 0 ? (
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatNumber(finished)} of {formatNumber(job.total_rows)} rows ·{" "}
                {Math.floor((finished / job.total_rows) * 100)}%
              </span>
            ) : null}
          </div>
          {job.total_rows > 0 ? <ImportBar job={job} /> : null}
          {job.total_rows > 0 ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {statCards.map((s) => (
                <div key={s.key} className="flex flex-col gap-1">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span aria-hidden className={`size-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums">{formatNumber(job.counts[s.key])}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {job.total_rows > 0 ? (
        <section aria-label="Rows" className="flex flex-col gap-3">
          <FilterTabs
            label="Filter rows by status"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            tabs={[
              { value: "all", label: "All", count: job.total_rows },
              { value: "failed", label: "Failed", count: job.counts.failed },
              { value: "needs_review", label: "Needs review", count: job.counts.needs_review },
              { value: "done", label: "Done", count: job.counts.done },
              { value: "pending", label: "Pending", count: job.counts.pending },
            ]}
          />
          <DataTable
            table={table}
            caption="Rows in this import"
            minWidth={640}
            empty="No rows with this status."
            onRowClick={rows.some((r) => r.product_id) ? (row) => row.original.product_id && router.push(`/products/${row.original.product_id}`) : undefined}
            rowLabel={(row) => `Row ${row.original.row}`}
          />
          <Pagination
            page={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={table.getFilteredRowModel().rows.length}
            onPage={(p) => table.setPageIndex(p)}
            onPageSize={(size) => table.setPagination({ pageIndex: 0, pageSize: size })}
          />
        </section>
      ) : null}

    </>
  );
}
