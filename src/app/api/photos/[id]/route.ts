import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { photoFile } from "@/server/products";
import { storage } from "@/server/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

export const GET = withStore<{ id: string }>(async (ctx, _request, { id }) => {
  const file = await photoFile(ctx.store.id, id);
  if (!file) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const ext = file.fileName.split(".").pop()?.toLowerCase() || file.storageKey.split(".").pop() || "";
  return new Response(Readable.toWeb(storage.stream(file.storageKey)) as ReadableStream, {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
