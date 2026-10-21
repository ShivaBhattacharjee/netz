import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/server/env";
import { consume } from "@/server/rate-limit";

async function soleOwnedStores(userId: string) {
  const result = await db.execute<{ store_id: string }>(sql`
    select sm.store_id from store_member sm
    where sm.user_id = ${userId} and sm.role = 'owner'
      and not exists (select 1 from store_member o where o.store_id = sm.store_id and o.role = 'owner' and o.user_id <> ${userId})
  `);
  return result.rows.map((r) => r.store_id);
}

export const auth = betterAuth({
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
    },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        const stores = await soleOwnedStores(user.id);
        if (stores.length) {
          throw new APIError("BAD_REQUEST", { message: `You are the only owner of ${stores.length} store(s). Delete them or add another owner first.` });
        }
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/social": { window: 60, max: 10 },
      "/callback/*": { window: 60, max: 20 },
      "/delete-user": { window: 3600, max: 3 },
    },
    customStorage: { consume: (key, rule) => consume(`auth:${key}`, rule) },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
