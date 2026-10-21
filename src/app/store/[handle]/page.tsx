import { redirect } from "next/navigation";
import { requireStore } from "@/lib/auth/session";
import { countryFor } from "@/lib/locale";
import { shopHref } from "@/server/storefront";

export default async function StoreProductPreview({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ country?: string }> }) {
  const [{ active }, { handle }, query] = await Promise.all([requireStore(), params, searchParams]);
  redirect(shopHref(active.slug, `/${encodeURIComponent(handle)}`, { country: countryFor(query.country).code, preview: true }));
}
