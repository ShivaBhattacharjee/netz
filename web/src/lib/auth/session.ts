import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { store, storeMember } from "@/db/schema";
import { auth } from ".";

export const ACTIVE_STORE_COOKIE = "active_store";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export const getStores = cache(async (userId: string) =>
  db
    .select({ id: store.id, name: store.name, slug: store.slug, domain: store.domain, role: storeMember.role })
    .from(storeMember)
    .innerJoin(store, eq(store.id, storeMember.storeId))
    .where(eq(storeMember.userId, userId))
    .orderBy(asc(storeMember.createdAt)),
);

export type MemberStore = Awaited<ReturnType<typeof getStores>>[number];

export async function requireStore() {
  const user = await requireUser();
  const stores = await getStores(user.id);
  if (stores.length === 0) redirect("/onboarding");

  const wanted = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value;
  const active = stores.find((s) => s.id === wanted) ?? stores[0];
  return { user, stores, active };
}

export async function getApiContext() {
  const session = await getSession();
  if (!session) return null;
  const stores = await getStores(session.user.id);
  if (stores.length === 0) return null;
  const wanted = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value;
  const active = stores.find((s) => s.id === wanted) ?? stores[0];
  return { user: session.user, store: active };
}
