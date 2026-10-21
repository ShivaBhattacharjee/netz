import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AI_MODE: z.enum(["anthropic", "mock"]).optional(),
  ANTHROPIC_API_KEY: z.string().default(""),
  AI_MODEL_FAST: z.string().min(1).default("claude-haiku-5-5"),
  AI_MODEL_STRONG: z.string().min(1).default("claude-haiku-5-5"),
  AI_MODEL_TRANSLATE: z.string().min(1).default("claude-haiku-5-5"),
  STORAGE_DIR: z.string().default(".data/uploads"),
  AI_RPM: z.coerce.number().int().positive().optional(),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(0),
})
  .transform((e) => ({ ...e, AI_MODE: e.AI_MODE ?? (e.ANTHROPIC_API_KEY ? "anthropic" : "mock") }))
  .refine((e) => e.AI_MODE === "mock" || e.ANTHROPIC_API_KEY.length > 0, {
    path: ["ANTHROPIC_API_KEY"],
    message: "AI_MODE=anthropic needs ANTHROPIC_API_KEY",
  });

export type Env = z.infer<typeof schema>;

const appSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.string().url(),
});

export function assertAppEnv() {
  env();
  const parsed = appSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n  ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ")}`);
  }
}

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment:\n  ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
