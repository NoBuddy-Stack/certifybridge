---
status: pending
priority: p2
issue_id: "047"
tags: [code-review, security, reliability, email]
dependencies: []
---

# 047 · No cold-start guard for missing RESEND_API_KEY — silent email failures in production

## Problem Statement

verify-payment.js:24 creates `new Resend(undefined)` if RESEND_API_KEY is not set. Unlike RAZORPAY_KEY_SECRET which has an explicit guard at line 38, RESEND_API_KEY has no equivalent. The client is constructed silently, all sends fail silently (caught at line 184), and students receive no confirmation email — with no operator-visible failure at startup.

## Findings

- `verify-payment.js:24`: `const resend = new Resend(process.env.RESEND_API_KEY)` — no null check
- `verify-payment.js:38`: RAZORPAY_KEY_SECRET has an explicit guard that throws on missing value
- `verify-payment.js:184`: email send errors are caught and swallowed, producing no user-facing or operator-visible signal
- The asymmetry means a misconfigured deployment silently degrades email delivery without any alert
- Students who pay successfully never receive a confirmation email, creating support burden and trust issues

## Proposed Solutions

Add a module-level guard mirroring the Razorpay pattern. Choose one of:

**Option A — warn (non-fatal, degrades gracefully):**
```js
if (!process.env.RESEND_API_KEY) {
  console.error('[verify-payment] RESEND_API_KEY is not configured — confirmation emails will not be sent.');
}
```

**Option B — throw on cold start (fail fast, matches Razorpay guard pattern):**
```js
if (!process.env.RESEND_API_KEY) {
  throw new Error('[verify-payment] RESEND_API_KEY is not configured.');
}
```

Option B is preferred for consistency with the existing RAZORPAY_KEY_SECRET guard and because silent email failure is a bad user experience on a payment portal.

## Acceptance Criteria

- Missing RESEND_API_KEY is visible in cold-start logs
- Optionally throws at startup like the existing Razorpay credential guard
- No silent email failures — operator is alerted to misconfiguration at deploy time, not after a student reports missing confirmation
