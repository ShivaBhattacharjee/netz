"use client";

import { Eye, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { actions, useProducts, useProductsReady } from "@/lib/data/store";
import { formatMoney, formatNumber } from "@/lib/format";
import type { Product } from "@/lib/types";
import { PageHeader, ProductStatusLabel } from "./common";
import { EmptyState } from "./empty-state";
import { PageLoader } from "./page-loader";
import { PhotoTile } from "./store-chrome";

function priceLabel(p: Product) {
  const prices = p.variants.map((v) => v.price_cents).filter((c): c is number => c !== null);
  if (!prices.length) return "No price";
  return `${prices.length > 1 ? "From " : ""}${formatMoney(Math.min(...prices), p.variants[0].currency)}`;
}

function matches(p: Product, query: string) {
  const q = query.trim().toLowerCase();
  return !q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q));
}

function AddProductsSheet({ open, onOpenChange, candidates }: { open: boolean; onOpenChange: (o: boolean) => void; candidates: Product[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = candidates.filter((p) => matches(p, query));
  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.id));

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function add() {
    const ids = [...picked];
    void actions.approve(ids);
    toast.success(`Added ${formatNumber(ids.length)} product${ids.length === 1 ? "" : "s"} to the storefront`);
    setPicked(new Set());
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">Add products to the storefront</SheetTitle>
          <SheetDescription>Adding a product approves it, so shoppers can see it right away.</SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search products" placeholder="Search title, SKU, category" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          <Button variant="ghost" disabled={shown.length === 0} onClick={() => shown.forEach((p) => toggle(p.id, !allShownPicked))}>
            {allShownPicked ? "Clear" : `Select ${formatNumber(shown.length)}`}
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">{candidates.length ? "No products match this search." : "Every product that can be listed is already on the storefront."}</li>
          ) : (
            shown.map((p) => (
              <li key={p.id} className="border-b last:border-0">
                <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-muted/40">
                  <Checkbox checked={picked.has(p.id)} onCheckedChange={(v) => toggle(p.id, Boolean(v))} aria-label={`Add ${p.title}`} />
                  <PhotoTile src={p.photos[0]} className="size-10 shrink-0 rounded-md [&_svg]:size-4" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{p.title}</span>
                    <span className="truncate text-xs text-muted-foreground tabular-nums">{priceLabel(p)}</span>
                  </span>
                  <ProductStatusLabel status={p.status} />
                </label>
              </li>
            ))
          )}
        </ul>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={picked.size === 0} onClick={add}>
            Add {picked.size ? formatNumber(picked.size) : ""} to storefront
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function StorefrontView() {
  const products = useProducts();
  const ready = useProductsReady();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const listed = useMemo(() => products.filter((p) => p.status === "approved").sort((a, b) => a.title.localeCompare(b.title)), [products]);
  const candidates = useMemo(
    () => products.filter((p) => p.status === "ready" || p.status === "needs_review").sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title) : a.status === "ready" ? -1 : 1)),
    [products],
  );
  const shown = listed.filter((p) => matches(p, query));

  const header = (
    <PageHeader
      title="Storefront"
      meta={ready ? `${formatNumber(listed.length)} product${listed.length === 1 ? "" : "s"} listed` : undefined}
      actions={
        <>
          <Button variant="outline" asChild>
            <Link href="/store">
              <Eye data-icon="inline-start" />
              Preview
            </Link>
          </Button>
          <Button onClick={() => setAdding(true)} disabled={!ready}>
            <Plus data-icon="inline-start" />
            Add products
          </Button>
        </>
      }
    />
  );

  if (!ready) {
    return (
      <>
        {header}
        <PageLoader />
      </>
    );
  }

  return (
    <>
      {header}
      <AddProductsSheet open={adding} onOpenChange={setAdding} candidates={candidates} />

      {listed.length === 0 ? (
        <EmptyState
          title="Nothing on the storefront yet"
          description="Shoppers only see products you list here. Add products that are ready, or approve them from the products table."
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus data-icon="inline-start" />
              Add products
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative w-full sm:w-72">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label="Search listed products" placeholder="Search listed products" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          {shown.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No listed products match this search.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
              {shown.map((p) => (
                <li key={p.id} className="group relative flex flex-col gap-2.5">
                  <Link href={`/products/${p.id}`} className="flex flex-col gap-2.5">
                    <PhotoTile src={p.photos[0]} />
                    <span className="flex flex-col gap-0.5">
                      <span className="truncate text-sm font-medium group-hover:underline">{p.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{priceLabel(p)}</span>
                    </span>
                  </Link>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={`Remove ${p.title} from the storefront`}
                    title="Remove from storefront"
                    className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => {
                      void actions.unpublish([p.id]);
                      toast.success(`Removed "${p.title}" from the storefront`, {
                        action: { label: "Undo", onClick: () => void actions.approve([p.id]) },
                      });
                    }}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
