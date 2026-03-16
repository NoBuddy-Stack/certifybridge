---
status: pending
priority: p1
issue_id: "040"
tags: [code-review, security, injection]
dependencies: []
---

# 040 · Unsanitized razorpay_payment_id reflected in error response (log injection)

## Problem Statement
`api/verify-payment.js:98` concatenates the raw `razorpay_payment_id` from `req.body` directly into the JSON error response string without applying the `s()` sanitizer. This means newlines, carriage returns, or control characters in the payment ID pass through into: (1) the HTTP response body, (2) the server log entry at line 94. If logs are parsed by a SIEM or log viewer that renders structured text, this is a log injection vector.

**Why it matters:** Log injection can falsify audit trails. On payment portals, forged log entries can mask fraudulent activity.

## Findings
- `api/verify-payment.js:98`: `'...contact support with your payment ID: ' + razorpay_payment_id`
- `razorpay_payment_id` is from `req.body` at this point — the `s()` sanitizer runs later at line 104
- The same unsanitized value is logged at line 94: `console.error('[verify-payment] Signature mismatch', { razorpay_payment_id, ... })`
- `s()` strips `\r\n\t` and truncates — applying it here would neutralize the vector

## Proposed Solutions

### Option A: Apply s() before reflection (Recommended)
```js
const safePaymentId = s(razorpay_payment_id || '', 50);
return res.status(400).json({
  error: 'Payment verification failed. Please contact support with your payment ID: ' + safePaymentId,
});
```
Also update the `console.error` at line 94 to log the sanitized value.

### Option B: Generic error message
Return a generic error without reflecting the payment ID at all. Less useful for support triage.

## Acceptance Criteria
- [ ] A `razorpay_payment_id` containing `\r\nX-Injected: header` does not appear in response or logs
- [ ] Valid payment IDs are still reflected correctly (for support reference)
- [ ] Log entries do not contain raw user input
