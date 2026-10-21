"use client";

import { useImportStream } from "@/lib/realtime";

export function ImportTicker({ storeId }: { storeId: string }) {
  useImportStream(storeId);
  return null;
}
