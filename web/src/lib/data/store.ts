"use client";

import { useSyncExternalStore } from "react";
import type { ImportJob, Locale, Product, SeoFields, TranslatableField, TranslatedLocale } from "../types";
import { seedImports, seedProducts } from "./seed";

export type LiveStatus = "connecting" | "live" | "offline";

interface State {
  storeId: string;
  live: LiveStatus;
  imports: ImportJob[];
  products: Product[];
}

export interface RerunSettings {
  model: string;
  prompt: string;
  fields: string[];
  note: string;
}

const initial: State = { storeId: "st_atelier", live: "connecting", imports: seedImports, products: seedProducts };
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

function scoped<T extends { store_id: string }>(pick: (s: State) => T[]) {
  let source: T[] | null = null;
  let storeId = "";
  let result: T[] = [];
  return (s: State) => {
    const items = pick(s);
    if (items !== source || s.storeId !== storeId) {
      source = items;
      storeId = s.storeId;
      result = items.filter((i) => i.store_id === storeId);
    }
    return result;
  };
}

const selectImports = scoped((s) => s.imports);
const selectProducts = scoped((s) => s.products);
const serverImports = selectImports(initial);
const serverProducts = selectProducts(initial);

export function useImports(): ImportJob[] {
  return useSyncExternalStore(subscribe, () => selectImports(state), () => serverImports);
}

export function useProducts(): Product[] {
  return useSyncExternalStore(subscribe, () => selectProducts(state), () => serverProducts);
}

export function useStoreId(): string {
  return useSyncExternalStore(subscribe, () => state.storeId, () => initial.storeId);
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(subscribe, () => state.live, () => initial.live);
}

function updateProduct(id: string, fn: (p: Product) => Product) {
  setState({ products: state.products.map((p) => (p.id === id ? fn(p) : p)) });
}

const now = () => new Date().toISOString();

export const actions = {
  setStore(storeId: string) {
    setState({ storeId });
  },

  setLive(live: LiveStatus) {
    if (state.live !== live) setState({ live });
  },

  rerun(ids: string[], settings: RerunSettings) {
    const set = new Set(ids);
    setState({
      products: state.products.map((p) =>
        set.has(p.id) && p.status !== "approved"
          ? {
              ...p,
              status: "ready",
              review_reason: null,
              usage: { ...p.usage, model: settings.model },
              updated_at: now(),
            }
          : p,
      ),
    });
  },

  editSeo(id: string, locale: Locale, field: keyof SeoFields, value: string) {
    updateProduct(id, (p) => ({ ...p, seo: { ...p.seo, [locale]: { ...p.seo[locale], [field]: value } }, updated_at: now() }));
  },

  approve(ids: string[]) {
    const set = new Set(ids);
    setState({
      products: state.products.map((p) =>
        set.has(p.id) && p.status !== "failed" ? { ...p, status: "approved", review_reason: null, updated_at: now() } : p,
      ),
    });
  },

  sendBack(id: string, note: string) {
    updateProduct(id, (p) => ({
      ...p,
      status: "needs_review",
      review_reason: note ? `Sent back: ${note}` : "Sent back for regeneration",
      updated_at: now(),
    }));
  },

  editField(id: string, field: "title" | "description_html" | "category", value: string) {
    updateProduct(id, (p) => {
      if (p[field] === value) return p;
      const manual = p.manual_fields.includes(field) ? p.manual_fields : [...p.manual_fields, field];
      const translations = structuredClone(p.translations);
      if (field !== "category") {
        for (const locale of ["de", "fr"] as const) {
          const t = translations[locale][field];
          t.state = t.origin === "manual" ? "out_of_date" : "missing";
        }
      }
      return { ...p, [field]: value, manual_fields: manual, translations, updated_at: now() };
    });
  },

  editTranslation(id: string, locale: TranslatedLocale, field: TranslatableField, text: string) {
    updateProduct(id, (p) => {
      const translations = structuredClone(p.translations);
      translations[locale][field] = { text, origin: "manual", state: "current" };
      const key = `translations.${locale}.${field}`;
      const manual = p.manual_fields.includes(key) ? p.manual_fields : [...p.manual_fields, key];
      return { ...p, translations, manual_fields: manual, updated_at: now() };
    });
  },

  addImport(file: { name: string; size: number }, photoCount: number, rows: number) {
    const job: ImportJob = {
      id: `imp_${Math.random().toString(36).slice(2, 8)}`,
      store_id: state.storeId,
      file_name: file.name,
      file_bytes: file.size,
      photo_count: photoCount,
      total_rows: rows,
      counts: { pending: rows, done: 0, needs_review: 0, failed: 0 },
      status: "queued",
      resume_in_seconds: null,
      error: null,
      created_at: now(),
      unmatched_photos: [],
      cost_micros: 0,
    };
    setState({ imports: [job, ...state.imports] });
    return job.id;
  },

  cancelImport(id: string) {
    setState({
      imports: state.imports.map((j) =>
        j.id === id ? { ...j, status: "cancelled", resume_in_seconds: null, error: "Cancelled. Rows already finished are kept." } : j,
      ),
    });
  },

  deleteImport(id: string) {
    setState({ imports: state.imports.filter((j) => j.id !== id) });
  },

  retryFailed(id: string) {
    setState({
      imports: state.imports.map((j) => {
        if (j.id !== id) return j;
        if (j.status === "failed" && j.total_rows === 0) return { ...j, status: "queued", error: null };
        return {
          ...j,
          status: "processing",
          counts: { ...j.counts, pending: j.counts.pending + j.counts.failed, failed: 0 },
        };
      }),
    });
  },

  tick() {
    let changed = false;
    const imports = state.imports.map((j) => {
      if (j.status === "queued") {
        changed = true;
        return { ...j, status: "processing" as const };
      }
      if (j.status === "paused" && j.resume_in_seconds !== null) {
        changed = true;
        const left = j.resume_in_seconds - 1;
        return left > 0
          ? { ...j, resume_in_seconds: left }
          : { ...j, status: "processing" as const, resume_in_seconds: null, error: null };
      }
      if (j.status !== "processing") return j;
      changed = true;
      const step = Math.min(j.counts.pending, Math.max(3, Math.round(j.total_rows / 400)));
      const failed = Math.random() < 0.15 ? 1 : 0;
      const review = Math.min(step - failed, Math.round(step * 0.1));
      const done = step - failed - review;
      const counts = {
        pending: j.counts.pending - step,
        done: j.counts.done + done,
        needs_review: j.counts.needs_review + review,
        failed: j.counts.failed + failed,
      };
      return {
        ...j,
        counts,
        cost_micros: j.cost_micros + step * 2100,
        status: counts.pending === 0 ? ("completed" as const) : j.status,
      };
    });
    if (changed) setState({ imports });
  },
};
