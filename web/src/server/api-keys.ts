import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { apiKey, store } from "@/db/schema";
import { newId, sha256 } from "./ids";

const MAX_KEYS_PER_STORE = 20;
const TOUCH_AFTER_MS = 60_000;

export class ApiKeyInputError extends Error {}

export async function createApiKey(storeId: string, userId: string | null, name: string) {
  const active = await db.select({ id: apiKey.id }).from(apiKey).where(and(eq(apiKey.storeId, storeId), isNull(apiKey.revokedAt)));
  if (active.length >= MAX_KEYS_PER_STORE) throw new ApiKeyInputError(`A store can have at most ${MAX_KEYS_PER_STORE} active keys`);
  const secret = `cf_${randomBytes(24).toString("base64url")}`;
  const id = newId("key");
  await db.insert(apiKey).values({ id, storeId, name, prefix: secret.slice(0, 10), hash: sha256(secret), createdBy: userId });
  return { id, key: secret };
}

export async function listApiKeys(storeId: string) {
  const rows = await db.select().from(apiKey).where(and(eq(apiKey.storeId, storeId), isNull(apiKey.revokedAt))).orderBy(desc(apiKey.createdAt));
  return rows.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    created_at: k.createdAt.toISOString(),
    last_used_at: k.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeApiKey(storeId: string, id: string) {
  const revoked = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, id), eq(apiKey.storeId, storeId), isNull(apiKey.revokedAt)))
    .returning({ id: apiKey.id });
  if (revoked.length === 0) throw new ApiKeyInputError("API key not found");
}

export async function storeForKey(secret: string) {
  if (!secret.startsWith("cf_")) return null;
  const [row] = await db
    .select({ keyId: apiKey.id, userId: apiKey.createdBy, id: store.id, name: store.name, slug: store.slug, domain: store.domain })
    .from(apiKey)
    .innerJoin(store, eq(store.id, apiKey.storeId))
    .where(and(eq(apiKey.hash, sha256(secret)), isNull(apiKey.revokedAt)));
  if (!row) return null;
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKey.id, row.keyId), or(isNull(apiKey.lastUsedAt), lt(apiKey.lastUsedAt, new Date(Date.now() - TOUCH_AFTER_MS)))));
  return { userId: row.userId, store: { id: row.id, name: row.name, slug: row.slug, domain: row.domain } };
}
