/**
 * api/webhook.js
 * POST /api/webhook
 *
 * Safety net for browser-close scenarios: if the user's browser crashes or
 * loses connectivity after Razorpay captures payment but before the frontend
 * calls /api/verify-payment, this handler ensures the application record is
 * still created in MongoDB.
 *
 * Setup (one-time):
 *   1. Razorpay Dashboard → Settings → Webhooks → Add Webhook
 *   2. URL: https://<your-vercel-domain>/api/webhook
 *   3. Events: payment.captured
 *   4. Copy the Webhook Secret → set as RAZORPAY_WEBHOOK_SECRET env var
 *      (IMPORTANT: this is a DIFFERENT secret from RAZORPAY_KEY_SECRET)
 *
 * Body parsing: disabled (bodyParser: false) so we receive the raw bytes for
 * HMAC verification. Re-stringifying a parsed body risks JSON key-order
 * differences that would silently break signature verification.
 */

import crypto        from 'crypto';
import clientPromise, { DB_NAME, COLLECTION_APPLICATIONS, ensureIndexes } from '../lib/mongodb.js';
import { PLANS }     from '../lib/plans.js';

// Disable Vercel's body parser — raw bytes are required for correct HMAC
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET is not configured.');
    return res.status(500).end();
  }

  // ── Read raw body ─────────────────────────────────────────────────────────
  // In Vercel (bodyParser:false), req is a readable stream.
  // In local dev, server.js detects bodyParser:false and passes a Buffer as req.body.
  let rawBody;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else {
    rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end',  () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  // ── Verify webhook signature ───────────────────────────────────────────────
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    console.error('[webhook] Missing X-Razorpay-Signature header');
    return res.status(400).end();
  }

  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  let isValid = false;
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    isValid = false;
  }

  if (!isValid) {
    console.error('[webhook] Signature verification failed');
    return res.status(400).end();
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.error('[webhook] Could not parse JSON body');
    return res.status(400).end();
  }

  // ── Route by event type ───────────────────────────────────────────────────
  const event = body?.event;

  if (event === 'payment.captured') {
    const payment = body?.payload?.payment?.entity;
    if (!payment) return res.status(200).end();

    const orderId   = payment.order_id;
    const paymentId = payment.id;
    const planKey   = payment.notes?.plan;

    if (!orderId || !paymentId) {
      console.error('[webhook] Missing order_id or payment_id in payload');
      return res.status(200).end(); // 200 so Razorpay doesn't retry indefinitely
    }

    const planValid = planKey && Object.prototype.hasOwnProperty.call(PLANS, planKey);
    const amount    = planValid
      ? PLANS[planKey].amount
      : Math.round(payment.amount / 100); // fallback: convert paise from Razorpay

    try {
      const client = await clientPromise;
      const col    = client.db(DB_NAME).collection(COLLECTION_APPLICATIONS);

      await ensureIndexes(col);

      // upsert: safe whether the browser path already ran or not.
      // $setOnInsert only writes when a new document is created (upsertedCount: 1).
      const result = await col.updateOne(
        { razorpayOrderId: orderId },
        {
          $setOnInsert: {
            razorpayOrderId:   orderId,
            razorpayPaymentId: paymentId,
            paymentStatus:     'paid',
            plan:              planKey || null,
            planName:          planValid ? PLANS[planKey].name : null,
            amount,
            source:            'webhook',
            createdAt:         new Date(),
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        console.log('[webhook] Fallback record created (browser path missed):', orderId);
      } else {
        console.log('[webhook] Record already exists (browser path succeeded):', orderId);
      }

    } catch (dbErr) {
      console.error('[webhook] MongoDB error:', dbErr.message);
      // Return 500 so Razorpay retries — this is a recoverable transient error
      return res.status(500).end();
    }

  } else {
    // Log unhandled events so we know what Razorpay is sending
    console.log('[webhook] Unhandled event type:', event);
  }

  return res.status(200).json({ status: 'ok' });
}
