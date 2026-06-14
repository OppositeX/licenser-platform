/**
 * Single-instance in-memory rate limiter. Survives the lifetime of one
 * lambda; fleet-wide enforcement needs Upstash/KV — see TAKEOVER.md TODO.
 * For validate calls (60 rpm per IP+key), single-instance is fine because
 * a hot license tends to land on the same lambda via Vercel's request routing.
 */

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateLimitResult { ok: boolean; remaining: number; resetIn: number; }

export function rateLimit(key: string, limit = 60, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
    // Tiny GC — drop the oldest 10% when we cross MAX_KEYS.
    if (buckets.size > MAX_KEYS) {
      const drop = Math.floor(MAX_KEYS * 0.1);
      let i = 0;
      for (const k of buckets.keys()) {
        if (i++ >= drop) break;
        buckets.delete(k);
      }
    }
  }
  b.count += 1;
  const ok = b.count <= limit;
  return { ok, remaining: Math.max(0, limit - b.count), resetIn: Math.max(0, b.resetAt - now) };
}
