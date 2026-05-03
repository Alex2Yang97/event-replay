import { Redis } from "@upstash/redis";

let client: Redis | null = null;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

export function getRedis(): Redis | null {
  return getClient();
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return (await c.get<T>(key)) ?? null;
  } catch (err) {
    console.warn("kv get failed:", err);
    return null;
  }
}

export async function kvSet<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    if (ttlSeconds) {
      await c.set(key, value, { ex: ttlSeconds });
    } else {
      await c.set(key, value);
    }
  } catch (err) {
    console.warn("kv set failed:", err);
  }
}

export async function kvSetNx<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    const res = ttlSeconds
      ? await c.set(key, value, { ex: ttlSeconds, nx: true })
      : await c.set(key, value, { nx: true });
    return res === "OK";
  } catch (err) {
    console.warn("kv setnx failed:", err);
    return false;
  }
}

export function kvEnabled(): boolean {
  return getClient() !== null;
}
