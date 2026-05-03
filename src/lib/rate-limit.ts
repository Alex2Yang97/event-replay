import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/kv";

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const redis = getRedis();
  if (!redis) {
    limiter = null;
    return null;
  }
  limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: false,
    prefix: "replay:rl",
  });
  return limiter;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
};

export async function checkReplayRateLimit(
  ip: string
): Promise<RateLimitResult> {
  const l = getLimiter();
  if (!l) {
    return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: 0 };
  }
  try {
    const { success, remaining, limit, reset } = await l.limit(ip);
    return { allowed: success, remaining, limit, resetAt: reset };
  } catch (err) {
    console.warn("rate limit check failed (fail-open):", err);
    return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: 0 };
  }
}
