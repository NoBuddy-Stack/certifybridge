---
status: pending
priority: p2
issue_id: "037"
tags: [code-review, architecture]
dependencies: []
---

# 037 · No test-mode bypass for agent/integration testing of full payment flow

## Problem Statement

`POST /api/verify-payment` requires a valid Razorpay `(orderId, paymentId, signature)` triple and the HMAC must verify against `RAZORPAY_KEY_SECRET`. This triple can only be produced by the Razorpay browser SDK completing a real or test-mode transaction. There is no environment flag that allows integration tests or agents to exercise the full form submission without a browser-based payment.

**Why it matters:** The entire `/api/verify-payment` path — which is where all application data is written to MongoDB and confirmation emails are sent — is unreachable by any automated test without either a real browser or direct Razorpay SDK integration. This makes it impossible to write integration tests, run CI smoke tests, or have an agent complete a full end-to-end submission.

## Findings

- `api/verify-payment.js` lines 55–100: HMAC verification is unconditional — no escape hatch
- No test fixtures, no mock payment IDs, no documented procedure for synthetic completions
- Razorpay provides test-mode keys (`rzp_test_*`) but the browser SDK is still required to generate a valid signature
- No `NODE_ENV === 'test'` path anywhere in the API handlers

**Location:** `api/verify-payment.js` (HMAC block)

## Proposed Solutions

### Option A: `RAZORPAY_SKIP_SIG_CHECK` env flag (Recommended for staging)
Add a guarded bypass that is only active when an explicit flag is set AND the environment is non-production:

```js
const skipSigCheck = process.env.NODE_ENV !== 'production'
  && process.env.RAZORPAY_SKIP_SIG_CHECK === 'true';

if (!skipSigCheck) {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature))) {
    return res.status(400).json({ error: 'Invalid payment signature.' });
  }
}
```

This enables agents and integration tests on staging to submit `{ razorpay_order_id: "order_test", razorpay_payment_id: "pay_test", razorpay_signature: "any" }` and have the full flow execute.

**Pros:** Easy to implement, double-guarded (NODE_ENV + explicit flag), invisible in production
**Cons:** Risk of accidentally enabling in production if `NODE_ENV` is misconfigured — mitigate by also checking a second secret env var

### Option B: Razorpay Node SDK for agent-issued test payments
Document that agents must initialize the Razorpay Node SDK with `rzp_test_*` keys, create a test order, complete it programmatically using the Razorpay test payment API, then retrieve the signature. This requires no code change but is complex.

**Pros:** No code change, uses real Razorpay test infrastructure
**Cons:** Requires complex SDK setup, not documented anywhere, Razorpay test API not publicly documented

**Effort:** Small (Option A)
**Risk:** Medium if deferred — full integration testing remains impossible

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/verify-payment.js`
- **Staging env vars:** `NODE_ENV=test`, `RAZORPAY_SKIP_SIG_CHECK=true`
- **Production guard:** Must NEVER set `RAZORPAY_SKIP_SIG_CHECK` in Vercel production environment

## Acceptance Criteria

- [ ] With `NODE_ENV=test` + `RAZORPAY_SKIP_SIG_CHECK=true`, synthetic payment IDs accepted
- [ ] Without both flags, HMAC verification unchanged
- [ ] Vercel production environment has no `RAZORPAY_SKIP_SIG_CHECK` variable
- [ ] Integration test written that submits a complete application using synthetic payment IDs

## Work Log

- 2026-03-16: Flagged by agent-native-reviewer during code review
