export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./server/log");
  try {
    const { env } = await import("./server/env");
    env();
    const { assertMigrated } = await import("./db/migrations");
    await assertMigrated();
  } catch (error) {
    log.error("app refused to start", { error: (error as Error).message });
    process.exit(1);
  }
}
