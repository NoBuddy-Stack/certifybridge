---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, security, cors]
dependencies: []
---

# No CORS Restriction on Payment API Endpoints

## Problem Statement

Neither API handler sets `Access-Control-Allow-Origin` headers, and `vercel.json` has no CORS configuration. Vercel's default allows all origins. This means:

1. Any website can `POST /api/create-order` cross-origin, creating orphaned Razorpay orders (quota abuse)
2. Any website can attempt `POST /api/verify-payment` (HMAC check prevents fraud, but generates MongoDB load)
3. No CSRF protection on order creation

While the payment's trust anchor (HMAC signature verification) is not bypassable via CORS abuse, an open CORS policy on a payment API is a compliance gap and enables order spam that pollutes the Razorpay dashboard.

When the form is embedded on a separate domain (e.g., the Framer marketing site), explicit CORS headers are also required for the API calls to work at all.

## Findings

- `api/create-order.js` — no `Access-Control-Allow-Origin` header set
- `api/verify-payment.js` — no CORS headers
- `vercel.json` — no CORS configuration
- Vercel default: `Access-Control-Allow-Origin: *`

## Proposed Solutions

### Option A: Set CORS headers in each handler
Add at the top of each handler:
```js
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
if (ALLOWED_ORIGIN) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
}
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

if (req.method === 'OPTIONS') return res.status(200).end();
```
Add `ALLOWED_ORIGIN=https://yourproductiondomain.com` to `.env.example` and Vercel env vars.
- **Effort:** Small
- **Risk:** Low — test that form still works from production domain

### Option B: Configure CORS via vercel.json headers
Add CORS headers in the `headers` block (combine with todo 004 for security headers).
- **Pros:** Centralized; no code changes
- **Cons:** Less flexible for per-endpoint control; Vercel static headers can't check env vars

## Recommended Action

Option A — gives per-endpoint control and allows environment-specific origins.

## Technical Details

- **Affected files:** `api/create-order.js`, `api/verify-payment.js`
- **New env var:** `ALLOWED_ORIGIN`

## Acceptance Criteria

- [ ] `Origin: https://evil.com` → request is rejected or lacks CORS headers (browser blocks it)
- [ ] `Origin: https://yourproductiondomain.com` → request succeeds with correct CORS headers
- [ ] `OPTIONS` preflight requests return 200 with correct headers
- [ ] Form on production domain still submits payments successfully

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
