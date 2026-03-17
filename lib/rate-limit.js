/**
 * lib/rate-limit.js
 * In-process sliding-window rate limiter.
 *
 * Provides per-IP protection within a single serverless instance.
 * NOTE: Not shared across Vercel instances — for distributed rate limiting
 * across all instances, use Upstash Redis (@upstash/ratelimit).
 *
 * Suitable for preventing rapid-fire abuse from a single IP hitting
 * the same warm instance. Works well in local dev and as a first line
 * of defence in production.
 */

const _windows = new Map();

/** Eviction: sweep stale entries every EVICT_INTERVAL calls */
const EVICT_INTERVAL = 100;
const MAX_WINDOW_MS  = 120_000; // entries older than 2 min are always stale
let _callCount = 0;

function evictStale() {
  const now = Date.now();
  for (const [key, hits] of _windows) {
    const recent = hits.filter(t => now - t < MAX_WINDOW_MS);
    if (recent.length === 0) {
      _windows.delete(key);
    } else {
      _windows.set(key, recent);
    }
  }
}

/**
 * Returns true if the request is allowed, false if rate limited.
 *
 * @param {string}  ip         - Client IP address (use 'unknown' if unavailable)
 * @param {object}  opts
 * @param {number}  opts.max       - Maximum requests allowed in the window (default 10)
 * @param {number}  opts.windowMs  - Window size in milliseconds (default 60 000)
 * @param {string}  opts.key       - Optional prefix to namespace limits per endpoint
 */
export function checkRateLimit(ip, { max = 10, windowMs = 60_000, key = '' } = {}) {
  // Periodic eviction to prevent unbounded Map growth
  if (++_callCount >= EVICT_INTERVAL) {
    _callCount = 0;
    evictStale();
  }

  const mapKey = `${key}:${ip || 'unknown'}`;
  const now    = Date.now();
  const hits   = (_windows.get(mapKey) || []).filter(t => now - t < windowMs);

  if (hits.length >= max) return false;

  hits.push(now);
  _windows.set(mapKey, hits);
  return true;
}
