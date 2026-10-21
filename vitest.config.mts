import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/*.test.ts"],
    testTimeout: 30_000,
    env: {
      DATABASE_URL: "postgres://test@localhost:5433/test",
      REDIS_URL: "redis://localhost:6379",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      BETTER_AUTH_URL: "http://localhost:3000",
      AI_MODE: "mock",
      STORAGE_DIR: path.join(os.tmpdir(), "catalogforge-tests"),
    },
  },
});
