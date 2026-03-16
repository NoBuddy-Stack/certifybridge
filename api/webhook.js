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
 * Note on body parsing: Vercel auto-parses JSON bodies, so we re-stringify
 * req.body for HMAC verification. This is safe because Razorpay sends simple,
 * consistently-structured JSON. For maximum robustness consider a raw-body
 * middleware if Razorpay ever changes their payload format.
 */

import crypto        from 'crypto';
import clientPromise from '../lib/mongodb.js';
import { PLAN_AMOUNTS, PLAN_NAMES } from '../lib/plans.js';

// Indexes created once per cold start
let indexesEnsured = false;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET is not configured.');
    return res.status(500).end();
  }

  // ── Verify webhook signature ───────────────────────────────────────────────
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    console.error('[webhook] Missing X-Razorpay-Signature header');
    return res.status(400).end();
  }

  // Vercel auto-parses JSON bodies; re-stringify for HMAC verification
  const rawBody    = JSON.stringify(req.body);
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

  // ── Handle payment.captured ────────────────────────────────────────────────
  if (req.body?.event === 'payment.captured') {
    const payment = req.body?.payload?.payment?.entity;
    if (!payment) return res.status(200).end();

    const orderId   = payment.order_id;
    const paymentId = payment.id;
    const planKey   = payment.notes?.plan;

    if (!orderId || !paymentId) {
      console.error('[webhook] Missing order_id or payment_id in payload');
      return res.status(200).end(); // 200 so Razorpay doesn't retry indefinitely
    }

    const amount = planKey && Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, planKey)
      ? PLAN_AMOUNTS[planKey]
      : Math.round(payment.amount / 100); // fallback: convert paise from Razorpay

    try {
      const client = await clientPromise;
      const col    = client.db('certifybridge').collection('applications');

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
            planName:          planKey && Object.prototype.hasOwnProperty.call(PLAN_NAMES, planKey)
                                 ? PLAN_NAMES[planKey] : null,
            amount,
            amountPaise:       amount * 100,
            source:            'webhook',  // distinguishes webhook-only records
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
  }

  return res.status(200).json({ status: 'ok' });
}

async function ensureIndexes(col) {
  if (indexesEnsured) return;
  await Promise.all([
    col.createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true, name: 'razorpayOrderId_unique' }),
    col.createIndex({ email: 1 }, { name: 'email_lookup' }),
  ]);
  indexesEnsured = true;
}
