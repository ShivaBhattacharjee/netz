"use client";

import { useImportStream } from "@/lib/realtime";

export function ImportTicker() {
  useImportStream();
  return null;
}
