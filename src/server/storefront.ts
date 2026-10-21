import { revalidateTag, unstable_cache } from "next/cache";
import { getPublishedByHandle, listPublished } from "./products";

const TTL_SECONDS = 60;
const tag = (storeId: string) => `storefront:${storeId}`;

export function cachedPublished(storeId: string) {
  return unstable_cache(() => listPublished(storeId), ["storefront-list", storeId], { tags: [tag(storeId)], revalidate: TTL_SECONDS })();
}

export function cachedPublishedByHandle(storeId: string, handle: string) {
  return unstable_cache(() => getPublishedByHandle(storeId, handle), ["storefront-product", storeId, handle], { tags: [tag(storeId)], revalidate: TTL_SECONDS })();
}

export function invalidateStorefront(storeId: string) {
  revalidateTag(tag(storeId));
}
