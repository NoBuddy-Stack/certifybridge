---
status: pending
priority: p1
issue_id: "023"
tags: [code-review, security]
dependencies: []
---

# 023 · Plan not cross-checked against Razorpay order record in verify-payment

## Problem Statement

`api/verify-payment.js` accepts `plan` from the client request body and trusts it without fetching the corresponding Razorpay order to confirm the plan matches what was recorded at order creation time. An attacker can pay for a `noob` plan, then submit the `orderId` and valid payment signature with `plan: "hacker"` in the verify body and receive a hacker-tier confirmation.

**Why it matters:** The HMAC signature only proves the payment itself is genuine — it does not prove the plan submitted at verify-time matches the plan that was used to set the order amount at create-time. This is a payment bypass vulnerability.

## Findings

- `api/create-order.js` stores the plan in Razorpay order `notes.plan` at creation time
- `api/verify-payment.js` re-reads `plan` from `req.body.plan` without fetching the order to compare
- The HMAC (`razorpay_order_id|razorpay_payment_id`) does not encode the plan — only the IDs
- An attacker paying ₹499 (noob) can claim ₹1599 (hacker) by substituting the plan in the verify POST

**Location:** `api/verify-payment.js` (plan extraction + database write), `api/create-order.js:notes.plan`

## Proposed Solutions

### Option A: Fetch Razorpay order and compare plan (Recommended)
After HMAC verification, fetch the order from Razorpay API and confirm `order.notes.plan === req.body.plan`:

```js
const order = await razorpay.orders.fetch(razorpay_order_id);
if (order.notes.plan !== plan) {
  return res.status(400).json({ error: 'Plan mismatch. Payment rejected.' });
}
```

**Pros:** Closes the attack vector completely, plan is authoritative from Razorpay's records
**Cons:** One extra Razorpay API call per verification

### Option B: Store plan→orderId mapping in MongoDB at create-order time
At order creation, write `{ orderId, plan }` to a temporary collection. At verify time, look up the plan by orderId server-side without trusting the client.

**Pros:** No extra Razorpay call, works even if Razorpay API is slow
**Cons:** Requires managing the temporary collection + TTL cleanup

**Effort:** Small (Option A)
**Risk:** CRITICAL — active payment bypass vulnerability

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/verify-payment.js`
- **Attack scenario:** Pay ₹499 for noob → submit verify with `plan: "hacker"` and the valid `orderId`/`paymentId`/`signature`

## Acceptance Criteria

- [ ] `verify-payment` fetches the Razorpay order and reads `notes.plan` server-side
- [ ] If `notes.plan !== req.body.plan`, request is rejected with 400
- [ ] Test: pay noob, submit hacker plan at verify → rejected
- [ ] Test: pay noob, submit noob plan at verify → accepted

## Work Log

- 2026-03-16: Flagged by security-sentinel + architecture-strategist agents during code review
