"use client";

import { flexRender, type Column, type Row, type Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean;
    className?: string;
    stopRowClick?: boolean;
  }
}

export function SortableHeader<T>({ column, label }: { column: Column<T>; label: string }) {
  const sorted = column.getIsSorted();
  const numeric = column.columnDef.meta?.numeric;
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn("plain-button inline-flex items-center gap-1 hover:text-foreground", sorted && "text-foreground", numeric && "flex-row-reverse")}
    >
      {label}
      <Icon aria-hidden className={cn("size-3", !sorted && "opacity-40")} />
    </button>
  );
}

export function DataTable<T>({
  table,
  onRowClick,
  isRowActive,
  rowLabel,
  empty,
  minWidth = 720,
  caption,
}: {
  table: Table<T>;
  onRowClick?: (row: Row<T>) => void;
  isRowActive?: (row: Row<T>) => boolean;
  rowLabel?: (row: Row<T>) => string;
  empty: ReactNode;
  minWidth?: number;
  caption: string;
}) {
  const rows = table.getRowModel().rows;
  const colCount = table.getVisibleLeafColumns().length;

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead className="text-xs text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : h.column.getCanSort() ? "none" : undefined}
                      className={cn(
                        "h-10 px-4 font-medium",
                        h.column.columnDef.meta?.numeric ? "text-right" : "text-left",
                        h.column.columnDef.meta?.className,
                      )}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-muted-foreground">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const active = row.getIsSelected() || isRowActive?.(row);
                return (
                  <tr
                    key={row.id}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-label={onRowClick ? rowLabel?.(row) : undefined}
                    data-state={active ? "selected" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
                    className={cn(
                      "border-b outline-none last:border-0 data-[state=selected]:bg-muted/60",
                      onRowClick && "cursor-pointer hover:bg-muted/40 focus-visible:bg-muted/40",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          onClick={meta?.stopRowClick ? (e) => e.stopPropagation() : undefined}
                          onKeyDown={meta?.stopRowClick ? (e) => e.stopPropagation() : undefined}
                          className={cn("px-4 py-2.5 align-middle", meta?.numeric && "text-right tabular-nums", meta?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
