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
  const mapKey = `${key}:${ip || 'unknown'}`;
  const now    = Date.now();
  const hits   = (_windows.get(mapKey) || []).filter(t => now - t < windowMs);

  if (hits.length >= max) return false;

  hits.push(now);
  _windows.set(mapKey, hits);
  return true;
}
