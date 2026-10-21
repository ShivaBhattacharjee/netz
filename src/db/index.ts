import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/server/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? new Pool({ connectionString: env().DATABASE_URL, max: env().DB_POOL_MAX });
if (env().NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
