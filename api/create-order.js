/**
 * api/create-order.js
 * POST /api/create-order
 *
 * Creates a Razorpay order server-side with the amount locked here.
 * The client NEVER supplies the amount — it only supplies the plan name.
 * This prevents price manipulation via DevTools.
 *
 * Request body:  { plan: "new" | "pro" | "hacker" }
 * Response:      { orderId, amount, currency }
 */

import Razorpay from 'razorpay';
import crypto   from 'crypto';
import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js';

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

  const { plan } = req.body || {};

  // Prototype-pollution-safe validation — plain object literals inherit
  // toString, __proto__, etc. which would be truthy and bypass a naive check.
  if (!plan || !Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, plan)) {
    return res.status(400).json({
      error: `Invalid plan "${plan}". Must be one of: new, pro, hacker.`,
    });
  }

  const amountINR   = PLAN_AMOUNTS[plan];
  const amountPaise = amountINR * 100; // Razorpay requires paise (1 INR = 100 paise)

  try {
    // Append random bytes to avoid collision when two requests land in the same ms
    const receipt = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        plan,
        planName: PLAN_NAMES[plan],
      },
    });

    return res.status(200).json({
      orderId:  order.id,       // e.g. "order_xxxxxxxxxxxxxxxxx" — send to frontend
      amount:   amountINR,      // INR, for display only
      currency: order.currency,
    });

  } catch (err) {
    console.error('[create-order] Razorpay error:', err);

    const statusCode = err.statusCode || 500;
    const message    = err?.error?.description || 'Could not create payment order. Please try again.';

    return res.status(statusCode || 500).json({ error: message });
  }
}
