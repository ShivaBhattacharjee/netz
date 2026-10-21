import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/db";
import { store } from "@/db/schema";
import type { Product } from "@/lib/types";
import { getPublishedByHandle, listPublished } from "./products";

const TTL_SECONDS = 60;
const tag = (storeId: string) => `storefront:${storeId}`;
const PRIVATE_PHOTO_PATH = "/api/photos/";

export const shopPath = (slug: string) => `/shop/${encodeURIComponent(slug)}`;

export function shopHref(slug: string, path: string, query: { country: string; page?: number; preview?: boolean }) {
  const params = new URLSearchParams({ country: query.country });
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.preview) params.set("preview", "1");
  return `${shopPath(slug)}${path}?${params}`;
}

/** Points photo URLs at the public photo route, which serves only photos of listed products. */
function withPublicPhotos(product: Product, slug: string): Product {
  return { ...product, photos: product.photos.map((url) => url.replace(PRIVATE_PHOTO_PATH, `/api/shop/${encodeURIComponent(slug)}/photos/`)) };
}

export function cachedStoreBySlug(slug: string) {
  return unstable_cache(
    async () => {
      const [row] = await db.select({ id: store.id, name: store.name, slug: store.slug }).from(store).where(eq(store.slug, slug));
      return row ?? null;
    },
    ["storefront-store", slug],
    { revalidate: TTL_SECONDS },
  )();
}

export async function cachedPublished(shop: { id: string; slug: string }, page: number) {
  const result = await unstable_cache(() => listPublished(shop.id, page), ["storefront-list", shop.id, String(page)], { tags: [tag(shop.id)], revalidate: TTL_SECONDS })();
  return { ...result, products: result.products.map((p) => withPublicPhotos(p, shop.slug)) };
}

export async function cachedPublishedByHandle(shop: { id: string; slug: string }, handle: string) {
  const product = await unstable_cache(() => getPublishedByHandle(shop.id, handle), ["storefront-product", shop.id, handle], {
    tags: [tag(shop.id)],
    revalidate: TTL_SECONDS,
  })();
  return product ? withPublicPhotos(product, shop.slug) : null;
}

export function invalidateStorefront(storeId: string) {
  revalidateTag(tag(storeId));
}
