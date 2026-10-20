"use client";

import { useEffect } from "react";
import { actions } from "./data/store";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function useImportStream() {
  useEffect(() => {
    if (!API_URL) {
      actions.setLive("live");
      const id = window.setInterval(actions.tick, 1000);
      return () => window.clearInterval(id);
    }

    let source: EventSource | null = null;
    let retry: number | undefined;
    let delay = 1000;

    const connect = () => {
      actions.setLive("connecting");
      source = new EventSource(`${API_URL}/v1/imports/stream`, { withCredentials: true });
      source.onopen = () => {
        delay = 1000;
        actions.setLive("live");
      };
      source.addEventListener("import.progress", () => actions.tick());
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
  }, []);
}
