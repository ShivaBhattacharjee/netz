import { log } from "./log";
import { redis } from "./redis";

const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {n, redis.call('PTTL', KEYS[1])}
`;

export interface Rule {
  /** Seconds. */
  window: number;
  max: number;
}

/** Counts one request against `key` in a fixed window. Fails open when Redis is unreachable. */
export async function consume(key: string, rule: Rule): Promise<{ allowed: boolean; retryAfter: number | null }> {
  try {
    const [n, ttl] = (await redis().eval(SCRIPT, 1, `rl:${key}`, rule.window * 1000)) as [number, number];
    return n <= rule.max ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
  } catch (error) {
    log.warn("rate limiter unavailable, allowing request", { error: (error as Error).message });
    return { allowed: true, retryAfter: null };
  }
}
