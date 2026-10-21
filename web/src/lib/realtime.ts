"use client";

import { useEffect } from "react";
import { actions, refreshProduct, resetForStore, scheduleRefresh } from "./data/store";

export function useImportStream(storeId: string) {
  useEffect(() => {
    resetForStore(storeId);
    let source: EventSource | null = null;
    let retry: number | undefined;
    let delay = 1000;

    const connect = () => {
      actions.setLive("connecting");
      source = new EventSource("/api/imports/stream");
      source.addEventListener("ready", () => {
        delay = 1000;
        actions.setLive("live");
        scheduleRefresh(true);
      });
      source.addEventListener("import.progress", () => scheduleRefresh(false));
      source.addEventListener("import.completed", () => scheduleRefresh(true));
      source.addEventListener("import.failed", () => scheduleRefresh(false));
      source.addEventListener("product.updated", (e) => {
        const { productId } = JSON.parse((e as MessageEvent<string>).data) as { productId: string };
        refreshProduct(productId);
      });
      source.onerror = () => {
        source?.close();
        actions.setLive("offline");
        retry = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30_000);
      };
    };

    connect();
    return () => {
      window.clearTimeout(retry);
      source?.close();
    };
  }, [storeId]);
}
