---
status: pending
priority: p3
issue_id: "070"
tags: [code-review, payments, data-integrity]
dependencies: []
---

# 070 · Razorpay prefill fields not cross-checked against verify-payment submission

## Problem Statement

The Razorpay checkout modal is prefilled with name, email, contact from the form. If the user edits these inside the modal, the values Razorpay captures can diverge from the verify-payment body. The server stores only the verify-payment body, not Razorpay's captured values. For an agent completing a real payment flow with Node SDK, the Razorpay transaction record and MongoDB record could have different names/emails with no detection.

## Findings

- The Razorpay checkout modal allows the user to edit prefilled name, email, and contact fields
- verify-payment.js stores the values submitted by the client form, not the values Razorpay recorded
- The Razorpay payment entity (fetchable via `razorpay.payments.fetch(id)`) contains the actual captured values
- Divergence between stored MongoDB record and Razorpay's record is currently undetected
- This is particularly relevant for automated agent payment flows using the Node SDK

## Proposed Solutions

After HMAC verification in verify-payment.js, optionally fetch the Razorpay payment entity and log a warning if the email diverges from the submitted email:

```js
const payment = await razorpay.payments.fetch(razorpay_payment_id);
if (payment.email !== submittedEmail) {
  console.warn('[verify-payment] Email mismatch: Razorpay=%s, submitted=%s', payment.email, submittedEmail);
}
```

Log-only at P3 level — no hard rejection (business decision).

## Acceptance Criteria

- Divergence between Razorpay-captured email and submitted email is logged as a warning
- No hard rejection occurs on divergence (business decision preserved)
