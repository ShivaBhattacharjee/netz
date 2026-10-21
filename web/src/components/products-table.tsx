"use client";

import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Check, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actions, useProducts, useProductsReady } from "@/lib/data/store";
import { download, toCsv, toJson, toShopifyCsv } from "@/lib/export";
import { formatMoney, formatNumber, minConfidence } from "@/lib/format";
import type { Product, ProductStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveStore } from "./active-store";
import { Confidence, PageHeader, ProductStatusLabel } from "./common";
import { DataTable, SortableHeader } from "./data-table";
import { EmptyState } from "./empty-state";
import { FilterTabs } from "./filter-tabs";
import { PageLoader } from "./page-loader";
import { Pagination } from "./pagination";
import { ProductSheet } from "./product-sheet";
import { RerunDialog } from "./rerun-dialog";
import { UploadButton } from "./upload-dialog";

type ConfidenceFilter = "all" | "low" | "medium" | "high";

const statusOrder: Record<ProductStatus, number> = { needs_review: 0, failed: 1, ready: 2, approved: 3 };

function minPrice(p: Product): number | null {
  const prices = p.variants.map((v) => v.price_cents).filter((c): c is number => c !== null);
  return prices.length ? Math.min(...prices) : null;
}

const columns: ColumnDef<Product>[] = [
  {
    id: "select",
    enableSorting: false,
    meta: { stopRowClick: true, className: "w-10 pr-0" },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all on this page"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
      />
    ),
    cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.title}`} checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(Boolean(v))} />,
  },
  {
    id: "title",
    accessorKey: "title",
    header: ({ column }) => <SortableHeader column={column} label="Product" />,
    meta: { className: "max-w-[340px]" },
    cell: ({ row }) => (
      <>
        <span className="block truncate font-medium">{row.original.title}</span>
        {row.original.review_reason ? <span className="block truncate text-xs text-muted-foreground">{row.original.review_reason}</span> : null}
      </>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    sortingFn: (a, b) => statusOrder[a.original.status] - statusOrder[b.original.status],
    filterFn: (row, _id, value: ProductStatus | "all") => value === "all" || row.original.status === value,
    header: ({ column }) => <SortableHeader column={column} label="Status" />,
    cell: ({ row }) => <ProductStatusLabel status={row.original.status} />,
  },
  {
    id: "category",
    accessorKey: "category",
    filterFn: (row, _id, value: string) => value === "all" || row.original.category === value,
    header: ({ column }) => <SortableHeader column={column} label="Category" />,
    meta: { className: "max-w-[220px] truncate text-muted-foreground" },
    cell: ({ row }) => row.original.category || "–",
  },
  {
    id: "variants",
    accessorFn: (p) => p.variants.length,
    enableSorting: false,
    header: "Variants",
    meta: { numeric: true },
  },
  {
    id: "price",
    accessorFn: (p) => minPrice(p) ?? -1,
    header: ({ column }) => <SortableHeader column={column} label="Price" />,
    meta: { numeric: true },
    cell: ({ row }) => {
      const p = row.original;
      const price = minPrice(p);
      if (price === null) return <span className="text-warning">Missing</span>;
      const missing = p.variants.some((v) => v.price_cents === null);
      return (
        <span className={cn(missing && "text-warning")} title={missing ? "Some variants have no price" : undefined}>
          {formatMoney(price, p.variants[0].currency)}
        </span>
      );
    },
  },
  {
    id: "confidence",
    accessorFn: (p) => minConfidence(p.confidence),
    filterFn: (row, _id, value: ConfidenceFilter) => {
      if (value === "all") return true;
      const m = minConfidence(row.original.confidence);
      if (value === "low") return m < 70;
      if (value === "medium") return m >= 70 && m < 85;
      return m >= 85;
    },
    header: ({ column }) => <SortableHeader column={column} label="Confidence" />,
    meta: { numeric: true },
    cell: ({ row }) =>
      Object.keys(row.original.confidence).length ? <Confidence score={minConfidence(row.original.confidence)} /> : <span className="text-muted-foreground">–</span>,
  },
];

function searchFilter(row: { original: Product }, _id: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const p = row.original;
  return p.title.toLowerCase().includes(q) || p.handle.includes(q) || p.category.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q));
}

export function ProductsTable() {
  const products = useProducts();
  const ready = useProductsReady();
  const activeStore = useActiveStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: "status", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([
    { id: "status", value: "all" },
    { id: "category", value: "all" },
    { id: "confidence", value: "all" },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [openId, setOpenId] = useState<string | null>(null);

  const table = useReactTable({
    data: products,
    columns,
    state: { sorting, columnFilters, globalFilter, rowSelection, pagination },
    getRowId: (p) => p.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    globalFilterFn: searchFilter,
    autoResetPageIndex: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filterValue = <T,>(id: string) => columnFilters.find((f) => f.id === id)?.value as T;
  const setFilter = (id: string, value: string) => table.getColumn(id)?.setFilterValue(value);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const counts = useMemo(() => {
    const c: Record<ProductStatus, number> = { needs_review: 0, failed: 0, ready: 0, approved: 0 };
    products.forEach((p) => (c[p.status] += 1));
    return c;
  }, [products]);

  const selectedIds = Object.keys(rowSelection);
  const approvable = selectedIds.filter((id) => {
    const s = products.find((p) => p.id === id)?.status;
    return s && s !== "failed" && s !== "approved";
  });
  const filtered = table.getFilteredRowModel().rows.map((r) => r.original);

  function exportAs(kind: "csv" | "json" | "shopify") {
    const rows = selectedIds.length ? products.filter((p) => rowSelection[p.id]) : filtered;
    if (kind === "csv") download("catalog.csv", toCsv(rows), "text/csv");
    else if (kind === "shopify") download("shopify-products.csv", toShopifyCsv(rows, activeStore.name), "text/csv");
    else download("catalog.json", toJson(rows), "application/json");
  }

  if (!ready) {
    return (
      <>
        <PageHeader title="Products" />
        <PageLoader />
      </>
    );
  }

  if (products.length === 0) {
    return (
      <>
        <PageHeader title="Products" />
        <EmptyState
          title="No products yet"
          description="Products appear here once an import has been cleaned and built by the AI. Start by uploading a supplier sheet."
          action={<UploadButton label="Upload a sheet" />}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download data-icon="inline-start" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {selectedIds.length ? `${formatNumber(selectedIds.length)} selected` : `${formatNumber(filtered.length)} filtered products`}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => exportAs("csv")}>CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs("json")}>JSON</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs("shopify")}>Shopify product CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterTabs
          label="Filter by status"
          value={filterValue<ProductStatus | "all">("status")}
          onChange={(v) => setFilter("status", v)}
          tabs={[
            { value: "all", label: "All", count: products.length },
            { value: "needs_review", label: "Needs review", count: counts.needs_review },
            { value: "ready", label: "Ready", count: counts.ready },
            { value: "approved", label: "Approved", count: counts.approved },
            { value: "failed", label: "Failed", count: counts.failed },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search products"
              placeholder="Search title, SKU, category"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterValue<string>("category")} onValueChange={(v) => setFilter("category", v)}>
            <SelectTrigger className="w-52" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterValue<string>("confidence")} onValueChange={(v) => setFilter("confidence", v)}>
            <SelectTrigger className="w-44" aria-label="Lowest field confidence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any confidence</SelectItem>
              <SelectItem value="low">Low (under 70%)</SelectItem>
              <SelectItem value="medium">Medium (70–84%)</SelectItem>
              <SelectItem value="high">High (85%+)</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.length ? (
            <div className="ml-auto flex items-center gap-2 text-sm" aria-live="polite">
              <span className="tabular-nums text-muted-foreground">{formatNumber(selectedIds.length)} selected</span>
              <Button variant="ghost" onClick={() => table.resetRowSelection()}>
                Clear
              </Button>
              <RerunDialog ids={selectedIds} onDone={() => table.resetRowSelection()} />
              <Button
                variant="success"
                disabled={approvable.length === 0}
                onClick={() => {
                  void actions.approve(approvable);
                  table.resetRowSelection();
                }}
              >
                <Check data-icon="inline-start" />
                Approve {approvable.length ? formatNumber(approvable.length) : ""}
              </Button>
            </div>
          ) : null}
        </div>

        <DataTable
          table={table}
          caption="Products. Select a row for details."
          minWidth={920}
          empty="No products match these filters."
          onRowClick={(row) => setOpenId(row.original.id)}
          isRowActive={(row) => row.original.id === openId}
          rowLabel={(row) => `Open ${row.original.title}`}
        />

        <ProductSheet product={products.find((p) => p.id === openId)} onClose={() => setOpenId(null)} />

        <Pagination
          page={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={table.getFilteredRowModel().rows.length}
          onPage={(p) => table.setPageIndex(p)}
          onPageSize={(s) => table.setPageSize(s)}
        />
      </div>
    </>
  );
}
