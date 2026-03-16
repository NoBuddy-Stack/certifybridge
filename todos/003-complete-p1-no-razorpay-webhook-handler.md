---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, architecture, payment, reliability]
dependencies: []
---

# No Razorpay Webhook Handler — Real Money Data Loss Risk

## Problem Statement

The current payment flow requires the browser to survive from the Razorpay payment modal closure through the `POST /api/verify-payment` call. If the browser closes, crashes, loses network connectivity, or the user navigates away after payment is captured but before `verify-payment` fires, the following unrecoverable state occurs:

- Razorpay has **captured real money** from the user
- MongoDB has **no application record**
- **No confirmation email** is ever sent
- The user has **no proof of payment** and no automated path to resolution

Razorpay's `payment.captured` webhook is the standard mechanism to handle this. Every payment that Razorpay captures triggers a server-to-server POST to a registered webhook URL, regardless of browser state. Without `api/webhook.js`, every browser-close scenario is a manual reconciliation task requiring access to the Razorpay dashboard.

As application volume grows, the probability of at least one user experiencing a browser crash during payment approaches 1. This is not a hypothetical — it is an expected production scenario.

## Findings

- No `api/webhook.js` exists
- No webhook URL registered in Razorpay dashboard
- `verify-payment.js` is the only persistence path — it is browser-dependent
- Architecture review: "highest-severity gap in the system"
- Razorpay docs: `payment.captured` event fires server-to-server when a payment is auto-captured (which is configured: `payment_capture: 1` in `create-order.js`)

## Proposed Solutions

### Option A: Dedicated webhook handler `api/webhook.js`
Create a new serverless function that:
1. Verifies `X-Razorpay-Signature` header (uses a **separate** webhook secret, not the API key secret)
2. Parses the event payload for `payment.captured` events
3. Performs `updateOne` with `upsert: true` keyed on `razorpayOrderId` (so it is safe to receive both the browser path and the webhook path)
4. Sends the confirmation email if the document was newly inserted (not an update)

```js
// api/webhook.js
import crypto from 'crypto';
import clientPromise from '../lib/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (req.body.event === 'payment.captured') {
    const payment = req.body.payload.payment.entity;
    // upsert into MongoDB using razorpayOrderId
    // send email only on insert (not on duplicate)
  }

  return res.status(200).json({ status: 'ok' });
}
```

Register `https://your-vercel-domain.vercel.app/api/webhook` in Razorpay Dashboard → Settings → Webhooks with `payment.captured` event selected. Add `RAZORPAY_WEBHOOK_SECRET` to Vercel env vars.

- **Pros:** Industry-standard solution; eliminates data loss; Razorpay retries on failure
- **Cons:** Requires a new env var (`RAZORPAY_WEBHOOK_SECRET`); slightly larger change
- **Effort:** Medium
- **Risk:** Low (additive change; existing flow still works)

### Option B: Client-side retry with localStorage persistence
Store payment IDs in `localStorage` before opening Razorpay. On page load, check for pending verification and retry automatically.
- **Pros:** No new backend code
- **Cons:** Does not handle browser crashes (localStorage is not written if browser crashes mid-payment); only mitigates network-drop scenarios; not as reliable as webhooks
- **Effort:** Medium
- **Risk:** Medium (localStorage can be cleared; does not cover all failure modes)

## Recommended Action

Option A. This is the standard industry approach and is explicitly supported by Razorpay's SDK.

## Technical Details

- **New file needed:** `api/webhook.js`
- **New env var needed:** `RAZORPAY_WEBHOOK_SECRET` (different from `RAZORPAY_KEY_SECRET`)
- **Razorpay dashboard:** Settings → Webhooks → Add New Webhook

## Acceptance Criteria

- [ ] `api/webhook.js` exists and handles `payment.captured` events
- [ ] Webhook signature is verified with `timingSafeEqual`
- [ ] `upsert: true` on MongoDB write (idempotent with browser path)
- [ ] Email sent only on new insert, not on duplicate upsert
- [ ] Webhook URL registered in Razorpay dashboard
- [ ] `RAZORPAY_WEBHOOK_SECRET` added to `.env.example`
- [ ] Test: simulate browser close after payment captured → record still appears in MongoDB via webhook

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
