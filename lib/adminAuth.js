/**
 * lib/adminAuth.js
 * Shared admin authentication middleware.
 *
 * Validates Authorization: Bearer <token> against ADMIN_TOKEN env var.
 * Uses crypto.timingSafeEqual to prevent timing attacks (consistent
 * with Razorpay signature verification in verify-payment.js).
 *
 * Usage in any api/admin/*.js handler:
 *   if (!requireAdmin(req, res)) return;
 */

import crypto from 'crypto';
import { checkRateLimit } from './rate-limit.js';

/**
 * Returns true if the request is authorized.
 * Sends 401/429/500 and returns false otherwise.
 */
export function requireAdmin(req, res) {
  // Rate limit admin endpoints per IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(ip, { max: 30, windowMs: 60_000, key: 'admin' })) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests.' }), false;
  }

  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.error('[adminAuth] ADMIN_TOKEN is not configured.');
    return res.status(500).json({ error: 'Admin access is not configured.' }), false;
  }

  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!auth) {
    return res.status(401).json({ error: 'Authorization required.' }), false;
  }

  // Constant-time comparison to prevent timing-based token enumeration
  const a = Buffer.from(auth);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid token.' }), false;
  }

  return true;
}
