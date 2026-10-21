"use client";

import { AlertTriangle, ArrowUpRight, Check, CornerDownRight, RotateCw, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { actions, fetchImportRow, useDataVersion } from "@/lib/data/store";
import type { ImportRowDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductStatusLabel, RowStatusLabel } from "./common";

export function ImportRowSheet({ importId, row, onClose, onOpenRow }: { importId: string; row: number | null; onClose: () => void; onOpenRow: (row: number) => void }) {
  const version = useDataVersion();
  const [detail, setDetail] = useState<ImportRowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (row === null) return;
    let cancelled = false;
    setError(null);
    fetchImportRow(importId, row)
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [importId, row, version]);

  const shown = detail && detail.row === row ? detail : null;

  return (
    <Sheet open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <span className="text-xs text-muted-foreground">Row {row}</span>
          <SheetTitle className="truncate text-lg">{shown?.title || shown?.sku || (row !== null ? `Row ${row}` : "")}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-3">
              {shown ? <RowStatusLabel status={shown.status} /> : null}
              {shown?.sku ? <span className="font-mono text-xs">{shown.sku}</span> : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          {error ? <p className="text-sm text-error">{error}</p> : null}
          {!shown && !error ? <Skeleton className="h-40 w-full" /> : null}
          {shown ? <Body detail={shown} onOpenRow={onOpenRow} /> : null}
        </div>

        {shown ? <Footer importId={importId} detail={shown} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Body({ detail, onOpenRow }: { detail: ImportRowDetail; onOpenRow: (row: number) => void }) {
  const tone = detail.status === "failed" ? "error" : detail.status === "needs_review" ? "warning" : null;
  const reason = detail.product?.review_reason ?? detail.reason;

  return (
    <>
      {reason && tone ? (
        <div className={cn("flex gap-2 rounded-lg border px-3 py-2 text-sm", tone === "error" ? "border-error/30 bg-error/10" : "border-warning/30 bg-warning/10")}>
          <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-error" : "text-warning")} />
          <span>{reason}</span>
        </div>
      ) : null}

      {detail.duplicate_of !== null ? (
        <button type="button" onClick={() => onOpenRow(detail.duplicate_of!)} className="plain-button flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50">
          <CornerDownRight className="size-4 text-muted-foreground" />
          Duplicate of row {detail.duplicate_of}. It was not processed again.
        </button>
      ) : null}

      {detail.product ? (
        <Section title="Product">
          <Link href={`/products/${detail.product.id}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/50">
            <span className="min-w-0 flex-1 truncate font-medium">{detail.product.title}</span>
            <ProductStatusLabel status={detail.product.status} />
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </Section>
      ) : null}

      {detail.repairs.length ? (
        <Section title="Cleaned">
          <ul className="flex flex-col gap-1.5 text-sm">
            {detail.repairs.map((r) => (
              <li key={r} className="flex gap-2">
                <Wrench className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                {r}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="As uploaded">
        <dl className="divide-y rounded-lg border text-sm">
          {Object.entries(detail.cells).map(([column, value]) => (
            <div key={column} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
              <dt className="truncate text-muted-foreground">{column}</dt>
              <dd className="break-words font-mono text-xs">{value}</dd>
            </div>
          ))}
          {Object.keys(detail.cells).length === 0 ? <p className="px-3 py-2 text-muted-foreground">Empty row</p> : null}
        </dl>
      </Section>
    </>
  );
}

function Footer({ importId, detail }: { importId: string; detail: ImportRowDetail }) {
  const [busy, setBusy] = useState(false);
  const canApprove = detail.product && (detail.product.status === "needs_review" || detail.product.status === "ready");

  if (!detail.retryable && !detail.product) return null;

  return (
    <SheetFooter className="flex-row gap-2 border-t p-5">
      {detail.retryable ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await actions.retry(importId, detail.group_key ?? undefined);
            setBusy(false);
          }}
        >
          <RotateCw data-icon="inline-start" />
          Retry this product
        </Button>
      ) : null}
      {detail.product ? (
        <Button variant="outline" asChild>
          <Link href={`/products/${detail.product.id}`}>Review</Link>
        </Button>
      ) : null}
      {canApprove ? (
        <Button className="ml-auto" disabled={busy} onClick={() => void actions.approve([detail.product!.id])}>
          <Check data-icon="inline-start" />
          Approve
        </Button>
      ) : null}
    </SheetFooter>
  );
}
