import { requireStore } from "@/lib/auth/session";
import { shopPath } from "@/server/storefront";
import { StorefrontView } from "@/components/storefront-view";

export default async function StorefrontPage() {
  const { active } = await requireStore();
  return <StorefrontView shopUrl={shopPath(active.slug)} />;
}
