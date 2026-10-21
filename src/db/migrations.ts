import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from ".";

interface Journal {
  entries: { tag: string; when: number }[];
}

/** Throws when the database is behind the migrations in `drizzle/`, so new code never runs on an old schema. */
export async function assertMigrated() {
  const journal = JSON.parse(readFileSync(path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle", "meta/_journal.json"), "utf8")) as Journal;
  let applied = 0;
  try {
    const result = await db.execute<{ last: string | null }>(sql`select max(created_at) as last from drizzle.__drizzle_migrations`);
    applied = Number(result.rows[0]?.last ?? 0);
  } catch {
    applied = 0;
  }
  const pending = journal.entries.filter((e) => e.when > applied).map((e) => e.tag);
  if (pending.length) throw new Error(`Database is missing ${pending.length} migration(s): ${pending.join(", ")}. Run \`pnpm db:migrate\` first.`);
}
