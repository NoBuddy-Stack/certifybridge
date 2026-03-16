---
status: pending
priority: p1
issue_id: "044"
tags: [code-review, agent-native, api-design, data-integrity]
dependencies: []
---

# 044 · No read endpoint to confirm application was persisted

## Problem Statement
`POST /api/verify-payment` returns `{ success: true }` before confirming the DB write succeeded. DB writes are non-blocking — the 200 is returned regardless of whether `insertOne` succeeded. An agent or user has no way to confirm that their application was actually saved. There is no `GET /api/application?orderId=...` endpoint. The unique index on `razorpayOrderId` exists but cannot be queried from outside.

**Why it matters:** (1) On network timeout, a client cannot distinguish "payment verified, record saved" from "payment verified, record lost." (2) Agents running automated flows cannot verify their write path. (3) Retry logic is impossible without idempotent read confirmation.

## Findings
- `verify-payment.js:148–179`: `insertOne` is inside a try/catch that swallows all errors with a 200 response
- `verify-payment.js:186`: `return res.status(200).json({ success: true })` — fires regardless of DB outcome
- No `GET /api/application` endpoint exists
- The unique index `razorpayOrderId_unique` exists but is only usable server-side

## Proposed Solutions

### Option A: Add GET /api/application?orderId= endpoint (Recommended)
```js
// api/application.js
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: 'orderId is required.' });
  const client = await clientPromise;
  const doc = await client.db('certifybridge').collection('applications')
    .findOne({ razorpayOrderId: orderId }, { projection: { razorpaySignature: 0, ipAddress: 0 } });
  if (!doc) return res.status(404).json({ error: 'Application not found.' });
  return res.status(200).json({ application: doc });
}
```
Excludes sensitive fields (`razorpaySignature`, `ipAddress`) from the response.

### Option B: Return persisted flag in verify-payment response
Extend the 200 response: `{ success: true, persisted: true/false }`. Simple but does not allow post-hoc verification.

## Acceptance Criteria
- [ ] `GET /api/application?orderId=order_xxx` returns the stored application
- [ ] Returns 404 for unknown orderId
- [ ] Does not expose razorpaySignature or raw IP in response
- [ ] Agents can use this to confirm write after POST /api/verify-payment
