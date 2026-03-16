---
status: pending
priority: p1
issue_id: "022"
tags: [code-review, security]
dependencies: []
---

# 022 · Webhook HMAC verified against re-stringified body, not raw bytes

## Problem Statement

The webhook handler (`api/webhook.js`) reads the request body, parses it as JSON, then re-stringifies it before computing the HMAC. This means the signature is verified against `JSON.stringify(parsedBody)`, not the original raw bytes Razorpay signed. If Razorpay's JSON serialisation differs from Node's `JSON.stringify` in any detail (key ordering, spacing, unicode escaping), the HMAC will fail on valid webhooks or — worse — pass on crafted payloads.

**Why it matters:** HMAC verification is the only proof that a webhook came from Razorpay. Verifying against a re-serialised body instead of the original signed bytes undermines this guarantee entirely.

## Findings

- `api/webhook.js` parses the body before HMAC verification instead of buffering raw bytes
- Razorpay webhook verification requires comparing against the exact bytes that were transmitted
- Node/Express body-parser middleware typically consumes the stream; the raw buffer must be captured before parsing
- This is distinct from `verify-payment.js` which correctly uses HMAC on request parameters

**Location:** `api/webhook.js` (signature verification block)

## Proposed Solutions

### Option A: Buffer raw body before parsing (Recommended)
Use Vercel's raw body access or a custom middleware that captures `req.body` as a `Buffer` before JSON parsing. Pass the raw buffer string to `crypto.createHmac`.

```js
// In webhook handler:
const rawBody = await getRawBody(req); // or use req.rawBody if configured
const expectedSig = crypto
  .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
```

**Pros:** Correct per Razorpay documentation, industry standard
**Cons:** Requires Vercel raw body configuration

### Option B: Disable body-parser for webhook route only
Configure the route to skip JSON parsing and handle raw bytes manually.

**Pros:** Simpler setup
**Cons:** Requires framework-level config

**Effort:** Small
**Risk:** HIGH if deferred — webhooks are currently verifiable only if Razorpay happens to produce identical JSON to Node's stringify

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `api/webhook.js`
- **Razorpay docs:** Webhook signature verification requires the raw request body string

## Acceptance Criteria

- [ ] Webhook handler captures raw bytes before any JSON parsing
- [ ] HMAC computed on raw bytes string, not `JSON.stringify(parsed)`
- [ ] Valid Razorpay test webhook passes signature verification
- [ ] Tampered payload fails signature verification

## Work Log

- 2026-03-16: Flagged by security-sentinel agent during code review
