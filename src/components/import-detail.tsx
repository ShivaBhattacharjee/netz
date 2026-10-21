"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCoreRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useImportRows, useImports, useImportsReady } from "@/lib/data/store";
import { formatBytes, formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import type { ImportRow, RowStatus } from "@/lib/types";
import { ImportStatusLabel, PageHeader, RowStatusLabel } from "./common";
import { DataTable } from "./data-table";
import { FilterTabs } from "./filter-tabs";
import { ImportActions } from "./import-actions";
import { ImportRowSheet } from "./import-row-sheet";
import { ImportBar, statusDetail } from "./import-progress";
import { PageLoader } from "./page-loader";
import { Pagination } from "./pagination";
import { UnmatchedPhotos } from "./unmatched-photos";

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


const statCards: { key: RowStatus; label: string; dot: string }[] = [
  { key: "done", label: "Done", dot: "bg-success" },
  { key: "needs_review", label: "Needs review", dot: "bg-warning" },
  { key: "failed", label: "Failed", dot: "bg-error" },
  { key: "pending", label: "Pending", dot: "bg-muted-foreground/50" },
];

export function ImportDetail({ id }: { id: string }) {
  const router = useRouter();
  const job = useImports().find((j) => j.id === id);
  const ready = useImportsReady();
  const [filter, setFilter] = useState<Filter>("all");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [openRow, setOpenRow] = useState<number | null>(null);

  const rows = useImportRows(id, Boolean(job && job.total_rows > 0));
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
    if (!ready) return <PageLoader />;
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
            onRowClick={(row) => setOpenRow(row.original.row)}
            isRowActive={(row) => row.original.row === openRow}
            rowLabel={(row) => `Open row ${row.original.row}`}
          />
          <Pagination
            page={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={table.getFilteredRowModel().rows.length}
            onPage={(p) => table.setPageIndex(p)}
            onPageSize={(size) => table.setPagination({ pageIndex: 0, pageSize: size })}
          />
          <ImportRowSheet importId={job.id} row={openRow} onClose={() => setOpenRow(null)} onOpenRow={setOpenRow} />
        </section>
      ) : null}

    </>
  );
}
