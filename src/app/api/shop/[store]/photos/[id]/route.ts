import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { publishedPhotoFile } from "@/server/products";
import { storage } from "@/server/storage";
import { cachedStoreBySlug } from "@/server/storefront";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

export async function GET(_request: Request, { params }: { params: Promise<{ store: string; id: string }> }) {
  const { store: slug, id } = await params;
  const shop = await cachedStoreBySlug(slug);
  const file = shop ? await publishedPhotoFile(shop.id, id) : null;
  if (!file) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const ext = file.storageKey.split(".").pop() ?? "";
  return new Response(Readable.toWeb(storage.stream(file.storageKey)) as ReadableStream, {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
