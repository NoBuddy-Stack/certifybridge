---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, architecture, observability]
dependencies: []
---

# No Health Check Endpoint

## Problem Statement

There is no `GET /api/health` or equivalent. Uptime monitors, deployment smoke tests, and status pages have no endpoint to probe. The only way to verify the deployment is functional is to attempt a real payment — which is not practical for continuous monitoring.

## Proposed Solution

```js
// api/health.js
import clientPromise from '../lib/mongodb.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const checks = {
    razorpayKeyId: !!process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    mongodbUri: !!process.env.MONGODB_URI,
    resendApiKey: !!process.env.RESEND_API_KEY,
  };

  try {
    const client = await Promise.race([
      clientPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    await client.db('astra_forge').command({ ping: 1 });
    checks.mongodb = 'ok';
  } catch (err) {
    checks.mongodb = 'error: ' + err.message;
  }

  const ok = Object.values(checks).every(v => v === true || v === 'ok');
  return res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
}
```

- **Effort:** Small
- Add `{ "src": "/api/health", "dest": "/api/health.js" }` is not needed — Vercel auto-routes

## Acceptance Criteria

- [ ] `GET /api/health` returns 200 when all env vars are set and MongoDB is reachable
- [ ] Returns 503 when MongoDB is unreachable
- [ ] Does not expose sensitive values (only boolean presence checks)

## Work Log

- 2026-03-15: Identified by architecture-strategist agent during code review
