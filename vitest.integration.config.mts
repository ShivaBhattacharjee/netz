import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.IT_DATABASE_URL ?? "postgres://netz:netz@localhost:5433/netz_it",
      REDIS_URL: process.env.IT_REDIS_URL ?? "redis://localhost:6379/9",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      BETTER_AUTH_URL: "http://localhost:3000",
      AI_MODE: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-fake",
      STORAGE_DIR: path.join(os.tmpdir(), "catalogforge-integration"),
    },
  },
});
