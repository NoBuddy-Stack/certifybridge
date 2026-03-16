---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security, payment]
dependencies: []
---

# Missing RAZORPAY_KEY_SECRET Guard in verify-payment.js

## Problem Statement

`api/verify-payment.js` uses `process.env.RAZORPAY_KEY_SECRET` directly in the HMAC computation without first checking that the value is non-empty:

```js
const expectedHex = crypto
  .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
  .update(body).digest('hex');
```

If `RAZORPAY_KEY_SECRET` is an **empty string** (a common misconfiguration — e.g., the env var is set in Vercel but left blank), `crypto.createHmac` succeeds and produces a deterministic HMAC keyed on `""`. An attacker who knows the formula `HMAC_SHA256(order_id + "|" + payment_id, "")` can compute a valid forged signature for any `razorpay_order_id` and `razorpay_payment_id`, **completely bypassing payment verification**. This allows registering fraudulent applications and triggering confirmation emails with zero actual payment.

If the env var is `undefined`, `createHmac` throws a `TypeError` which propagates as an unhandled 500 with no helpful error context.

Note: `api/create-order.js` already has this guard (lines 32-35). The same pattern must be applied to `verify-payment.js`.

## Findings

- `api/verify-payment.js:60-63` — no guard before `process.env.RAZORPAY_KEY_SECRET` usage
- `api/create-order.js:32-35` — correct guard exists here, inconsistently applied
- Empty string scenario: `createHmac('sha256', '').update('order|pay').digest('hex')` = predictable, forgeable
- Undefined scenario: unhandled TypeError → 500 response, all payments fail silently

## Proposed Solutions

### Option A: Early return guard (matches create-order.js pattern)
Add at the top of the handler, after method check:
```js
if (!process.env.RAZORPAY_KEY_SECRET) {
  console.error('[verify-payment] RAZORPAY_KEY_SECRET is not configured.');
  return res.status(500).json({ error: 'Payment verification is unavailable.' });
}
```
- **Pros:** Consistent with existing pattern in create-order.js; fails loudly; no forgery window
- **Effort:** Small (2 lines)
- **Risk:** None

### Option B: Module-level validation (fail fast at cold start)
At the top of the module (outside handler):
```js
if (!process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('[verify-payment] RAZORPAY_KEY_SECRET is not configured.');
}
```
- **Pros:** Fails at cold start, not at first request; consistent with lib/mongodb.js pattern
- **Cons:** Vercel logs the module-level throw differently; first request gets a 500 without the handler running
- **Effort:** Small
- **Risk:** Low

## Recommended Action

Option A — matches the existing guard pattern in `create-order.js` and gives a meaningful 500 response.

## Technical Details

- **Affected file:** `api/verify-payment.js:60-63`
- **OWASP:** A05 Security Misconfiguration

## Acceptance Criteria

- [ ] Empty string `RAZORPAY_KEY_SECRET` returns 500 (not a forged-signature 200)
- [ ] Missing `RAZORPAY_KEY_SECRET` returns 500 with a clear error message
- [ ] Valid `RAZORPAY_KEY_SECRET` continues to work correctly
- [ ] Error is logged server-side with `[verify-payment]` prefix

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
