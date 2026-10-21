import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");
const count = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    DATABASE_URL: z.string().url(),
    DB_POOL_MAX: count(10),
    MIGRATIONS_DIR: z.string().default("drizzle"),
    REDIS_URL: z.string().url(),

    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
    BETTER_AUTH_URL: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    GOOGLE_CLIENT_ID: z.string().default(""),
    GOOGLE_CLIENT_SECRET: z.string().default(""),

    AI_MODE: z.enum(["anthropic", "mock"]).optional(),
    ANTHROPIC_API_KEY: z.string().default(""),
    AI_MODEL_FAST: z.string().min(1).default("claude-haiku-5-5"),
    AI_MODEL_STRONG: z.string().min(1).default("claude-sonnet-5-5"),
    AI_MODEL_TRANSLATE: z.string().min(1).default("claude-haiku-5-5"),
    AI_RPM: z.coerce.number().int().positive().optional(),
    AI_BUDGET_MULTIPLIER: z.coerce.number().positive().default(3),
    AI_BUDGET_MIN_USD: z.coerce.number().positive().default(1),
    MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(0),
    PROMPTS_DIR: z.string().default("prompts"),
    EVALS_DIR: z.string().default("evals"),

    STORAGE_DIR: z.string().default(".data/uploads"),
    WEBHOOKS_ALLOW_PRIVATE: flag,

    WORKER_QUEUES: z.string().optional(),
    PARSE_CONCURRENCY: count(2),
    AI_CHEAP_CONCURRENCY: count(16),
    AI_STRONG_CONCURRENCY: count(6),
    TRANSLATE_CONCURRENCY: count(8),
    WEBHOOK_CONCURRENCY: count(4),
  })
  .transform((e) => ({ ...e, AI_MODE: e.AI_MODE ?? (e.ANTHROPIC_API_KEY ? "anthropic" : "mock") }))
  .refine((e) => e.AI_MODE === "mock" || e.ANTHROPIC_API_KEY.length > 0, {
    path: ["ANTHROPIC_API_KEY"],
    message: "AI_MODE=anthropic needs ANTHROPIC_API_KEY",
  })
  .refine((e) => e.NODE_ENV !== "production" || !e.WEBHOOKS_ALLOW_PRIVATE, {
    path: ["WEBHOOKS_ALLOW_PRIVATE"],
    message: "must not be enabled in production",
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws with every problem listed on first use. */
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
