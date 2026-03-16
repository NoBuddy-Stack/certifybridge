/**
 * api/create-order.js
 * POST /api/create-order
 *
 * Creates a Razorpay order server-side with the amount locked here.
 * The client NEVER supplies the amount — it only supplies the plan name.
 * This prevents price manipulation via DevTools.
 *
 * Request body:  { plan: "noob" | "pro" | "hacker" }
 * Response:      { orderId, amount, currency }
 */

import Razorpay from 'razorpay';
import crypto   from 'crypto';
import { PLANS }          from '../lib/plans.js';
import { checkRateLimit } from '../lib/rate-limit.js';

// Vercel body parser — 10 KB is generous for a plan-selection payload
export const config = { api: { bodyParser: { sizeLimit: '10kb' } } };

// Fail at cold start if credentials are missing — don't wait for first request
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('Razorpay credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured.');
}

// Module-level singleton — reused across warm invocations
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Rate limit: 10 order-creation attempts per IP per minute
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!checkRateLimit(ip, { max: 10, windowMs: 60_000, key: 'create-order' })) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  }

  const { plan } = req.body || {};

  // Prototype-pollution-safe validation
  if (!plan || !Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    return res.status(400).json({
      error: `Invalid plan "${plan}". Must be one of: ${Object.keys(PLANS).join(', ')}.`,
    });
  }

  const { amount: amountINR, name: planName } = PLANS[plan];
  const amountPaise = amountINR * 100; // Razorpay requires paise

  try {
    const receipt = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt,
      notes: { plan, planName },
    });

    return res.status(200).json({
      orderId:  order.id,
      amount:   amountINR,
      currency: order.currency,
    });

  } catch (err) {
    console.error('[create-order] Razorpay error:', err);
    const message    = err?.error?.description || 'Could not create payment order. Please try again.';
    // Map upstream Razorpay codes to safe client-facing codes (avoids leaking gateway internals)
    const clientCode = err.statusCode >= 400 && err.statusCode < 500 ? 400 : 503;
    return res.status(clientCode).json({ error: message });
  }
}
