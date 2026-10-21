export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertAppEnv } = await import("./server/env");
  const { assertMigrated } = await import("./db/migrations");
  const { log } = await import("./server/log");
  try {
    assertAppEnv();
    await assertMigrated();
  } catch (error) {
    log.error("app refused to start", { error: (error as Error).message });
    process.exit(1);
  }
}
