import IORedis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function createRedis(options: RedisOptions = {}) {
  return new IORedis(env().REDIS_URL, {
    maxRetriesPerRequest: null,
    ...options,
  });
}

export function redis() {
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}
