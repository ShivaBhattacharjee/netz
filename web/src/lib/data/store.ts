"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ImportJob, ImportRow, ImportRowDetail, Locale, Product, RowStatus, SeoFields, TranslatableField, TranslatedLocale } from "../types";
import { api } from "./api";

export type LiveStatus = "connecting" | "live" | "offline";

export interface RerunSettings {
  model: string;
  fields: string[];
  note: string;
}

interface State {
  live: LiveStatus;
  imports: ImportJob[];
  importsReady: boolean;
  products: Product[];
  productsReady: boolean;
  details: Record<string, Product>;
  version: number;
}

const initial: State = { live: "connecting", imports: [], importsReady: false, products: [], productsReady: false, details: {}, version: 0 };
let state: State = initial;
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useSelect<T>(select: (s: State) => T, server: T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => server);
}

function fail(error: unknown, fallback: string) {
  toast.error(error instanceof Error ? error.message : fallback);
}

let importsInFlight: Promise<void> | null = null;
let productsInFlight: Promise<void> | null = null;

function loadImports() {
  importsInFlight ??= api<{ imports: ImportJob[] }>("/api/imports")
    .then(({ imports }) => setState({ imports, importsReady: true }))
    .catch((error) => fail(error, "Could not load imports"))
    .finally(() => {
      importsInFlight = null;
    });
  return importsInFlight;
}

function loadProducts() {
  productsInFlight ??= api<{ products: Product[] }>("/api/products")
    .then(({ products }) => setState({ products, productsReady: true }))
    .catch((error) => fail(error, "Could not load products"))
    .finally(() => {
      productsInFlight = null;
    });
  return productsInFlight;
}

async function loadDetail(id: string) {
  try {
    const { product } = await api<{ product: Product }>(`/api/products/${id}`);
    setState({ details: { ...state.details, [id]: product }, products: state.products.map((p) => (p.id === id ? { ...product, sources: [] } : p)) });
  } catch (error) {
    if ((error as { status?: number }).status !== 404) fail(error, "Could not load the product");
    const details = { ...state.details };
    delete details[id];
    setState({ details });
  }
}

let currentStore: string | null = null;

export function resetForStore(storeId: string) {
  if (currentStore === storeId) return;
  const first = currentStore === null;
  currentStore = storeId;
  if (first) return;
  setState({ ...initial, live: state.live });
  void loadImports();
  void loadProducts();
}

export function useImports(): ImportJob[] {
  useEffect(() => {
    if (!state.importsReady) void loadImports();
  }, []);
  return useSelect((s) => s.imports, initial.imports);
}

export function useImportsReady(): boolean {
  return useSelect((s) => s.importsReady, false);
}

export function useProducts(): Product[] {
  useEffect(() => {
    if (!state.productsReady) void loadProducts();
  }, []);
  return useSelect((s) => s.products, initial.products);
}

export function useProductsReady(): boolean {
  return useSelect((s) => s.productsReady, false);
}

export function useProduct(id: string): { product: Product | undefined; ready: boolean } {
  const product = useSelect((s) => s.details[id], undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadDetail(id).finally(() => setReady(true));
  }, [id]);
  return { product, ready: ready || product !== undefined };
}

export function useLiveStatus(): LiveStatus {
  return useSelect((s) => s.live, initial.live);
}

export function useDataVersion(): number {
  return useSelect((s) => s.version, 0);
}

export function useImportRows(id: string, enabled: boolean): ImportRow[] {
  const version = useDataVersion();
  const [rows, setRows] = useState<ImportRow[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<{ rows: ImportRow[] }>(`/api/imports/${id}`)
      .then((r) => !cancelled && setRows(r.rows))
      .catch((error) => fail(error, "Could not load rows"));
    return () => {
      cancelled = true;
    };
  }, [id, enabled, version]);
  return rows;
}

export function fetchImportRows(id: string, status?: RowStatus) {
  return api<{ rows: ImportRow[] }>(`/api/imports/${id}${status ? `?status=${status}` : ""}`).then((r) => r.rows);
}

export function fetchImportRow(id: string, row: number) {
  return api<ImportRowDetail>(`/api/imports/${id}/rows/${row}`);
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshProductsNext = false;

export function scheduleRefresh(products: boolean) {
  refreshProductsNext ||= products;
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined;
    const withProducts = refreshProductsNext;
    refreshProductsNext = false;
    void loadImports();
    if (withProducts && state.productsReady) void loadProducts();
    setState({ version: state.version + 1 });
  }, 750);
}

export function refreshProduct(id: string) {
  if (state.details[id]) void loadDetail(id);
  scheduleRefresh(true);
}

function patchProducts(ids: Set<string>, fn: (p: Product) => Product) {
  const details = { ...state.details };
  for (const id of ids) if (details[id]) details[id] = fn(details[id]);
  setState({ products: state.products.map((p) => (ids.has(p.id) ? fn(p) : p)), details });
}

function replaceProduct(product: Product) {
  setState({ details: { ...state.details, [product.id]: product }, products: state.products.map((p) => (p.id === product.id ? { ...product, sources: [] } : p)) });
}

export const actions = {
  setLive(live: LiveStatus) {
    if (state.live !== live) setState({ live });
  },

  importCreated(job: ImportJob) {
    setState({ imports: [job, ...state.imports.filter((j) => j.id !== job.id)] });
  },

  async cancelImport(id: string) {
    try {
      await api(`/api/imports/${id}/cancel`, { method: "POST" });
      scheduleRefresh(false);
    } catch (error) {
      fail(error, "Could not cancel the import");
    }
  },

  async deleteImport(id: string) {
    try {
      await api(`/api/imports/${id}`, { method: "DELETE" });
      setState({ imports: state.imports.filter((j) => j.id !== id) });
      return true;
    } catch (error) {
      fail(error, "Could not delete the import");
      return false;
    }
  },

  async retry(id: string, groupKey?: string) {
    try {
      await api(`/api/imports/${id}/retry`, { method: "POST", json: groupKey ? { group_key: groupKey } : {} });
      toast.success(groupKey ? "Row queued again" : "Retry started");
      scheduleRefresh(false);
      return true;
    } catch (error) {
      fail(error, "Could not retry");
      return false;
    }
  },

  async approve(ids: string[]) {
    const before = state.products;
    const set = new Set(ids);
    patchProducts(set, (p) => (p.status === "failed" ? p : { ...p, status: "approved", review_reason: null }));
    try {
      await api("/api/products/approve", { method: "POST", json: { ids } });
      scheduleRefresh(false);
    } catch (error) {
      setState({ products: before });
      fail(error, "Could not approve");
    }
  },

  async unpublish(ids: string[]) {
    const before = state.products;
    patchProducts(new Set(ids), (p) => (p.status === "approved" ? { ...p, status: "ready" } : p));
    try {
      await api("/api/products/unpublish", { method: "POST", json: { ids } });
      scheduleRefresh(false);
    } catch (error) {
      setState({ products: before });
      fail(error, "Could not remove from the storefront");
    }
  },

  async deleteProducts(ids: string[]) {
    const before = state.products;
    const set = new Set(ids);
    setState({ products: state.products.filter((p) => !set.has(p.id)) });
    try {
      const { deleted } = await api<{ deleted: number }>("/api/products/delete", { method: "POST", json: { ids } });
      toast.success(`Deleted ${deleted} product${deleted === 1 ? "" : "s"}`);
      scheduleRefresh(true);
    } catch (error) {
      setState({ products: before });
      fail(error, "Could not delete");
    }
  },

  async sendBack(id: string, note: string) {
    try {
      await api(`/api/products/${id}/send-back`, { method: "POST", json: { note } });
      patchProducts(new Set([id]), (p) => ({ ...p, status: "needs_review", review_reason: note ? `Sent back: ${note}` : "Sent back for regeneration" }));
    } catch (error) {
      fail(error, "Could not send back");
    }
  },

  async rerun(ids: string[], settings: RerunSettings) {
    const { queued } = await api<{ queued: number }>("/api/products/rerun", { method: "POST", json: { ids, ...settings } });
    return queued;
  },

  async edit(id: string, edit: Record<string, unknown>) {
    try {
      const { product } = await api<{ product: Product }>(`/api/products/${id}`, { method: "PATCH", json: edit });
      replaceProduct(product);
    } catch (error) {
      fail(error, "Could not save the change");
    }
  },

  editField(id: string, field: "title" | "description_html" | "category", value: string) {
    return actions.edit(id, { kind: "field", field, value });
  },

  editTranslation(id: string, locale: TranslatedLocale, field: TranslatableField, text: string) {
    return actions.edit(id, { kind: "translation", locale, field, text });
  },

  editSeo(id: string, locale: Locale, field: keyof SeoFields, value: string) {
    return actions.edit(id, { kind: "seo", locale, field, value });
  },
};
