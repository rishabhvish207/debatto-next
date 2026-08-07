// lib/rateLimit.ts
//
// Minimal fixed-window rate limiter for the API routes that spend money
// (Groq calls) or hit Supabase on every request. This is in-memory, so it
// only protects a single running server process — on serverless platforms
// (Vercel etc.) each cold-started instance gets its own counters, so this
// is a best-effort speed bump against casual abuse, NOT a substitute for a
// shared store (Upstash/Redis) if this app is deployed across many
// concurrent instances. It's still worth having: it stops a single script
// hammering one instance from burning through the Groq quota, and costs
// nothing to add.
//
// Keyed by IP + a caller-supplied bucket name, so /api/debate and
// /api/tts don't share one budget.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so this Map doesn't grow forever on a
// long-running process. Cheap and only ever removes stale entries.
let lastSweep = Date.now();
function sweep() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req: Request): string {
  // Standard proxy headers (Vercel/most CDNs set x-forwarded-for as
  // "client, proxy1, proxy2" — the first entry is the original client).
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Checks and increments a fixed-window rate limit bucket for this request.
 * Call once per request, before doing any expensive work.
 */
export function checkRateLimit(
  req: Request,
  bucketName: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  sweep();
  const key = `${bucketName}:${clientIp(req)}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Standard 429 JSON response for a rejected request, with Retry-After set. */
export function rateLimitResponse(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSeconds) },
  });
}
