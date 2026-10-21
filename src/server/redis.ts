import IORedis, { type RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function createRedis(options: RedisOptions = {}) {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    ...options,
  });
}

export function redis() {
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}
