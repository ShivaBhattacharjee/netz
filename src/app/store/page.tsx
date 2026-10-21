import { redirect } from "next/navigation";
import { requireStore } from "@/lib/auth/session";
import { countryFor } from "@/lib/locale";
import { shopHref } from "@/server/storefront";

export default async function StorePreview({ searchParams }: { searchParams: Promise<{ country?: string; page?: string }> }) {
  const [{ active }, query] = await Promise.all([requireStore(), searchParams]);
  redirect(shopHref(active.slug, "", { country: countryFor(query.country).code, page: Number(query.page) || undefined, preview: true }));
}
