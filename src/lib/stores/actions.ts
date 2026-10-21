"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { store, storeMember } from "@/db/schema";
import { ACTIVE_STORE_COOKIE, requireUser } from "@/lib/auth/session";
import { createStoreSchema } from "./schema";

const MAX_STORES_PER_USER = 10;
const MAX_SLUG_ATTEMPTS = 5;

export interface CreateStoreState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "domain" | "currency", string>>;
  values?: { name: string; domain: string; currency: string };
}

function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "store";
}

function isUniqueViolation(error: unknown) {
  const cause = (error as { cause?: { code?: string } })?.cause ?? error;
  return (cause as { code?: string })?.code === "23505";
}

async function setActiveStore(storeId: string) {
  (await cookies()).set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createStore(_prev: CreateStoreState, formData: FormData): Promise<CreateStoreState> {
  const user = await requireUser();
  const values = {
    name: String(formData.get("name") ?? ""),
    domain: String(formData.get("domain") ?? ""),
    currency: String(formData.get("currency") ?? ""),
  };

  const parsed = createStoreSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: CreateStoreState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<CreateStoreState["fieldErrors"]>;
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }

  const [{ owned }] = await db
    .select({ owned: count() })
    .from(storeMember)
    .where(and(eq(storeMember.userId, user.id), eq(storeMember.role, "owner")));
  if (owned >= MAX_STORES_PER_USER) {
    return { error: `You can own at most ${MAX_STORES_PER_USER} stores.`, values };
  }

  const id = `st_${randomUUID().replace(/-/g, "")}`;
  const base = slugify(parsed.data.name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(store).values({
          id,
          name: parsed.data.name,
          slug,
          domain: parsed.data.domain,
          defaultCurrency: parsed.data.currency,
        });
        await tx.insert(storeMember).values({ storeId: id, userId: user.id, role: "owner" });
      });
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
    await setActiveStore(id);
    redirect("/imports");
  }

  return { error: "Could not create the store, please try again.", values };
}

export async function switchStore(storeId: string) {
  const user = await requireUser();
  const [membership] = await db
    .select({ storeId: storeMember.storeId })
    .from(storeMember)
    .where(and(eq(storeMember.userId, user.id), eq(storeMember.storeId, storeId)))
    .limit(1);
  if (!membership) return { error: "You don't have access to that store." };
  await setActiveStore(storeId);
  return {};
}
