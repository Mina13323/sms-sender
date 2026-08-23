import { query } from "@/lib/db";

/**
 * Fixed-window rate limiting backed by the database (serverless-safe: works
 * across lambda instances, unlike in-memory counters).
 *
 * Keys must never contain raw PII — use user ids or HMAC hashes.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const windowStart = new Date(windowStartMs);

  const { rows } = await query<{ count: number }>(
    `INSERT INTO rate_limit_buckets (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET count = rate_limit_buckets.count + 1
     RETURNING count`,
    [key, windowStart],
  );

  const count = rows[0]?.count ?? limit + 1;
  const allowed = count <= limit;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + windowSeconds * 1000 - now) / 1000),
  );

  // Opportunistic cleanup of expired buckets (~2% of calls)
  if (Math.random() < 0.02) {
    query(`DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '1 day'`, []).catch(
      () => undefined,
    );
  }

  return { allowed, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

/**
 * Duplicate-send guard: registers a fingerprint (HMAC hash, no PII) and
 * reports whether the identical request was already made inside the window.
 */
export async function isDuplicate(fingerprint: string, windowSeconds: number): Promise<boolean> {
  const result = await checkRateLimit(`dup:${fingerprint}`, 1, windowSeconds);
  return !result.allowed;
}
